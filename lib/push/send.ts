import "server-only";
import webpush from "web-push";
import { db } from "@/lib/db";

/**
 * Web Push delivery (F29). The only module that talks to a push service.
 *
 * Payloads are encrypted to the device's own key (RFC 8291) before they leave
 * the server, so Apple's, Google's and Mozilla's push services carry bytes they
 * cannot read. Even so, a payload is shown on a lock screen, so it carries a
 * title, a body and an in-app path — never notes, never a résumé line (N7).
 *
 * Unset VAPID keys are a supported state, like Razorpay's (F17): the profile
 * says notifications aren't switched on, rather than subscribing a device to a
 * sender that cannot sign.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** An in-app path ("/analysis/…/prep"). Never an absolute URL (N18 applied). */
  url: string;
  /** Collapses repeats on the device — a later reminder replaces an earlier one. */
  tag: string;
}

let configured: boolean | null = null;

export function pushConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@koustubh.org";
  if (!publicKey || !privateKey) return (configured = false);
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch {
    // A malformed key is the same state as no key: nothing can be signed.
    configured = false;
  }
  return configured;
}

/**
 * Sends one payload to every device a member has subscribed. A device the push
 * service says is gone (404/410) is deleted on the spot — that is the only way
 * a stale endpoint ever leaves the table. Returns counts only (N7).
 */
export async function sendToMember(
  clerkUserId: string,
  payload: PushPayload,
): Promise<{ devices: number; delivered: number; removed: number }> {
  if (!pushConfigured()) return { devices: 0, delivered: 0, removed: 0 };

  const subs = await db.pushSubscription.findMany({
    where: { clerkUserId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (subs.length === 0) return { devices: 0, delivered: 0, removed: 0 };

  const body = JSON.stringify(payload);
  const results = await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          // A reminder an hour late is worse than none — the round has moved on.
          { TTL: 60 * 60, urgency: "high", timeout: 10_000 },
        );
        return { id: sub.id, ok: true, gone: false };
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        return { id: sub.id, ok: false, gone: status === 404 || status === 410 };
      }
    }),
  );

  const delivered = results.filter((r) => r.ok).map((r) => r.id);
  const gone = results.filter((r) => r.gone).map((r) => r.id);
  await Promise.all([
    delivered.length > 0
      ? db.pushSubscription.updateMany({ where: { id: { in: delivered } }, data: { lastSentAt: new Date() } })
      : null,
    gone.length > 0 ? db.pushSubscription.deleteMany({ where: { id: { in: gone } } }) : null,
  ]);

  return { devices: subs.length, delivered: delivered.length, removed: gone.length };
}

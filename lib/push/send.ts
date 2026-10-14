import "server-only";
import webpush from "web-push";
import type { PushPayload } from "@/lib/domain/push";

/**
 * Web Push transport (F29). The only module that talks to a push service.
 *
 * Payloads are encrypted to the device's own key (RFC 8291) before they leave
 * the server, so Apple's, Google's and Mozilla's push services carry bytes they
 * cannot read. Even so, a payload is shown on a lock screen, so it carries a
 * title, a body and an in-app path — never notes, never a résumé line (N7).
 *
 * One call is one attempt at one device. Retries, TTL, dedupe and cleanup are
 * the outbox's job (lib/push/outbox.ts); this module only reports what the
 * push service said.
 *
 * Unset VAPID keys are a supported state, like Razorpay's (F17): the profile
 * says notifications aren't switched on, rather than subscribing a device to a
 * sender that cannot sign. The private key never leaves this module's process.
 */

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

export interface DeviceKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** What the push service answered. `status` null = no HTTP answer (network, timeout). */
export interface PushAttempt {
  status: number | null;
  retryAfter: string | null;
}

export async function pushOnce(
  device: DeviceKeys,
  payload: PushPayload,
  opts: { ttlSeconds: number; urgency: "normal" | "high"; topic: string },
): Promise<PushAttempt> {
  try {
    const res = await webpush.sendNotification(
      { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
      JSON.stringify(payload),
      { TTL: opts.ttlSeconds, urgency: opts.urgency, topic: opts.topic, timeout: 10_000 },
    );
    return { status: res.statusCode, retryAfter: null };
  } catch (e) {
    const failure = e as { statusCode?: number; headers?: Record<string, string> };
    return {
      status: typeof failure.statusCode === "number" ? failure.statusCode : null,
      retryAfter: failure.headers?.["retry-after"] ?? null,
    };
  }
}

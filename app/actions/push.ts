"use server";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { deviceLabel } from "@/lib/domain/reminders";
import { pushConfigured } from "@/lib/push/send";
import { enqueue, processOutbox } from "@/lib/push/outbox";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/**
 * Devices that receive reminders (F29, F29.2). A subscription is the browser's
 * own `PushSubscription.toJSON()` — the endpoint is issued by the device's
 * push service, never assembled here (N18 applied), and never logged (N7).
 *
 * Every action here is scoped to the signed-in member. There is no action that
 * sends to anyone but the caller: the test button pushes to the caller's own
 * devices, rate limited, and everything else is sent by the outbox from rows
 * that business events wrote.
 */

/** A member with more devices than this has stale ones; the oldest goes. */
const MAX_DEVICES = 10;

const SubscriptionInput = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(64),
  }),
});

const Endpoint = z.url({ protocol: /^https$/ }).max(2048);

const unconfigured = () => err(appError("misconfigured", "Notifications aren't switched on for this site yet."));

/**
 * Files this device after the member pressed "Turn on". Upsert by endpoint: a
 * device re-subscribing after a sign-in as someone else belongs to whoever
 * subscribed it last, never to both — and anything still queued for the
 * previous owner is cancelled at send time (the outbox checks ownership).
 */
export async function savePushSubscription(input: unknown): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!pushConfigured()) return unconfigured();

  const limited = rateLimit(`pushsave:${user.value}`, 20, 600);
  if (!limited.allowed) return err(appError("invalid_input", "Too many changes. Try again in a few minutes."));

  const parsed = SubscriptionInput.safeParse(input);
  if (!parsed.success) return err(appError("invalid_input", "This browser sent a subscription we can't use."));
  const { endpoint, keys } = parsed.data;
  const label = deviceLabel((await headers()).get("user-agent") ?? "");
  const now = new Date();

  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { clerkUserId: user.value, endpoint, p256dh: keys.p256dh, auth: keys.auth, deviceLabel: label, lastSeenAt: now },
    update: { clerkUserId: user.value, p256dh: keys.p256dh, auth: keys.auth, deviceLabel: label, enabled: true, lastSeenAt: now },
  });
  await trimDevices(user.value);

  revalidatePath("/profile");
  return ok(null);
}

async function trimDevices(clerkUserId: string): Promise<void> {
  const extra = await db.pushSubscription.findMany({
    where: { clerkUserId },
    orderBy: { lastSeenAt: "desc" },
    skip: MAX_DEVICES,
    select: { id: true },
  });
  if (extra.length > 0) {
    await db.pushSubscription.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
  }
}

export type ReconcileOutcome =
  /** The server has this device for this member. Nothing to do. */
  | "kept"
  /** The push service rotated the endpoint; the row now carries the new one. */
  | "rotated"
  /** The server has no row for this device (removed from another device, or
   * filed under another account): the browser should unsubscribe too. */
  | "removed";

/**
 * Called on every signed-in app open when permission is already granted
 * (components/push-sync.tsx) — never prompts, never creates a row the member
 * didn't ask for. Brings the server and the browser back into agreement:
 *
 *   - endpoint on file for this member → touch lastSeenAt, refresh the keys
 *   - endpoint unknown, but `previousEndpoint` is on file for this member →
 *     the push service rotated it (pushsubscriptionchange); swap it in place
 *   - otherwise → "removed": the member turned this device off elsewhere, or
 *     the device belongs to another account. The browser drops its
 *     subscription rather than quietly re-filing itself.
 */
export async function reconcilePushSubscription(
  input: unknown,
  previousEndpoint: string | null,
): Promise<Result<ReconcileOutcome>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!pushConfigured()) return unconfigured();

  const parsed = SubscriptionInput.safeParse(input);
  if (!parsed.success) return err(appError("invalid_input", "This browser sent a subscription we can't use."));
  const { endpoint, keys } = parsed.data;
  const now = new Date();

  const touched = await db.pushSubscription.updateMany({
    where: { endpoint, clerkUserId: user.value },
    data: { p256dh: keys.p256dh, auth: keys.auth, lastSeenAt: now },
  });
  if (touched.count > 0) return ok("kept");

  const previous = previousEndpoint ? Endpoint.safeParse(previousEndpoint) : null;
  if (previous?.success && previous.data !== endpoint) {
    const taken = await db.pushSubscription.findUnique({ where: { endpoint }, select: { id: true } });
    if (!taken) {
      const rotated = await db.pushSubscription.updateMany({
        where: { endpoint: previous.data, clerkUserId: user.value },
        data: { endpoint, p256dh: keys.p256dh, auth: keys.auth, lastSeenAt: now },
      });
      if (rotated.count > 0) return ok("rotated");
    }
  }
  return ok("removed");
}

/** By id (from the device list) or by endpoint (this browser unsubscribing). */
export async function removePushSubscription(by: { id: string } | { endpoint: string }): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const target = "id" in by ? z.uuid().safeParse(by.id) : Endpoint.safeParse(by.endpoint);
  if (!target.success) return err(appError("invalid_input", "That device isn't one of yours."));

  await db.pushSubscription.deleteMany({
    where: { clerkUserId: user.value, ...("id" in by ? { id: target.data } : { endpoint: target.data }) },
  });
  revalidatePath("/profile");
  return ok(null);
}

/** Pause or resume one device without losing its subscription (F29.2). */
export async function setDeviceEnabled(id: string, enabled: boolean): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = z.object({ id: z.uuid(), enabled: z.boolean() }).safeParse({ id, enabled });
  if (!parsed.success) return err(appError("invalid_input", "That device isn't one of yours."));

  const changed = await db.pushSubscription.updateMany({
    where: { id: parsed.data.id, clerkUserId: user.value },
    data: { enabled: parsed.data.enabled },
  });
  if (changed.count === 0) return err(appError("not_found", "That device isn't one of yours."));
  revalidatePath("/profile");
  return ok(null);
}

const PrefsInput = z.object({
  notifyRounds: z.boolean(),
  notifyStudy: z.boolean(),
  notifyDetails: z.boolean(),
});

/** What the member wants pushed, across every device (F29.2). */
export async function setNotificationPrefs(input: unknown): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = PrefsInput.safeParse(input);
  if (!parsed.success) return err(appError("invalid_input", "Those settings didn't come through. Try again."));

  await db.user.update({ where: { clerkUserId: user.value }, data: parsed.data });
  revalidatePath("/profile");
  return ok(null);
}

/** How long the "app closed" test waits — long enough to swipe the app away. */
const CLOSED_TEST_DELAY_MS = 30_000;

/**
 * Sends a test push to the caller's own devices — now, or (`later`) queued 30
 * seconds out so the member can close the app and see a push arrive with
 * nothing open. Goes through the outbox like everything else: a test that
 * works proves the real path, not a shortcut beside it.
 *
 * Reports what the push services ACCEPTED. Whether the phone showed it is
 * something only the member can see; Web Push does not report it back.
 */
export async function sendTestNotification(
  opts: { later?: boolean } = {},
): Promise<Result<{ accepted: number; devices: number; retrying: number; later: boolean }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!pushConfigured()) return unconfigured();

  const limited = rateLimit(`pushtest:${user.value}`, 5, 600);
  if (!limited.allowed) {
    return err(appError("invalid_input", `That's a few tests already. Try again in ${limited.retryAfterSeconds}s.`));
  }

  const clerkUserId = user.value;
  const now = Date.now();
  const later = opts.later === true;
  const queued = await enqueue({
    clerkUserId,
    category: "test",
    dedupeKey: `test:${randomUUID()}`,
    payload: () => ({
      title: later ? "Roleform reached you with the app closed" : "Roleform notifications are on",
      body: later
        ? "Background alerts work on this device. Reminders will land like this."
        : "This is where your interview reminders and study sessions will land.",
      url: "/profile",
      tag: "roleform-test",
    }),
    expiresAt: new Date(now + 10 * 60_000),
    notBefore: later ? new Date(now + CLOSED_TEST_DELAY_MS) : undefined,
  });
  if (queued.reason === "no_devices") {
    return err(appError("not_found", "No device has notifications on. Turn them on (or resume a paused device) first."));
  }

  if (later) {
    // Drained by this function after it replies; if it is cut short, the
    // next cron pass sends it — the row is durable either way.
    after(async () => {
      await new Promise((r) => setTimeout(r, CLOSED_TEST_DELAY_MS + 1_000));
      await processOutbox({ clerkUserId, limit: 20 });
    });
    return ok({ accepted: 0, devices: queued.devices, retrying: 0, later: true });
  }
  const sent = await processOutbox({ clerkUserId, limit: 20 });
  return ok({ accepted: sent.accepted, devices: queued.devices, retrying: sent.retrying, later: false });
}

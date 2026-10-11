"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { deviceLabel } from "@/lib/domain/reminders";
import { pushConfigured, sendToMember } from "@/lib/push/send";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/**
 * Devices that receive reminders (F29). A subscription is the browser's own
 * `PushSubscription.toJSON()` — the endpoint is issued by the device's push
 * service, never assembled here (N18 applied), and never logged (N7).
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

export async function savePushSubscription(input: unknown): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!pushConfigured()) {
    return err(appError("misconfigured", "Notifications aren't switched on for this site yet."));
  }

  const parsed = SubscriptionInput.safeParse(input);
  if (!parsed.success) return err(appError("invalid_input", "This browser sent a subscription we can't use."));
  const { endpoint, keys } = parsed.data;
  const label = deviceLabel((await headers()).get("user-agent") ?? "");

  // Upsert by endpoint: a device re-subscribing after a sign-in as someone
  // else belongs to whoever subscribed it last, never to both.
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { clerkUserId: user.value, endpoint, p256dh: keys.p256dh, auth: keys.auth, deviceLabel: label },
    update: { clerkUserId: user.value, p256dh: keys.p256dh, auth: keys.auth, deviceLabel: label },
  });

  const extra = await db.pushSubscription.findMany({
    where: { clerkUserId: user.value },
    orderBy: { createdAt: "desc" },
    skip: MAX_DEVICES,
    select: { id: true },
  });
  if (extra.length > 0) {
    await db.pushSubscription.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
  }

  revalidatePath("/profile");
  return ok(null);
}

/** By id (from the device list) or by endpoint (this browser unsubscribing). */
export async function removePushSubscription(by: { id: string } | { endpoint: string }): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;

  await db.pushSubscription.deleteMany({
    where: { clerkUserId: user.value, ...("id" in by ? { id: by.id } : { endpoint: by.endpoint }) },
  });
  revalidatePath("/profile");
  return ok(null);
}

export async function sendTestNotification(): Promise<Result<{ delivered: number; devices: number }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!pushConfigured()) {
    return err(appError("misconfigured", "Notifications aren't switched on for this site yet."));
  }

  const limited = rateLimit(`pushtest:${user.value}`, 5, 600);
  if (!limited.allowed) {
    return err(appError("invalid_input", `That's a few tests already. Try again in ${limited.retryAfterSeconds}s.`));
  }

  const result = await sendToMember(user.value, {
    title: "Roleform notifications are on",
    body: "This is where your interview-round reminders will land.",
    url: "/history",
    tag: "roleform-test",
  });
  if (result.devices === 0) {
    return err(appError("not_found", "No device is subscribed yet. Turn notifications on first."));
  }
  return ok({ delivered: result.delivered, devices: result.devices });
}

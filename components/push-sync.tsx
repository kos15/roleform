"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { reconcilePushSubscription } from "@/app/actions/push";
import { currentSubscription, deviceOwner, forgetDevice, lastEndpoint, rememberDevice } from "@/lib/push/client";

/**
 * Keeps this device and the server in agreement (F29, F29.2). Once per
 * signed-in page load, only when permission is already granted — this never
 * prompts and never files a device the member didn't turn on:
 *
 *   - "kept"     the server has it; nothing changes
 *   - "rotated"  the push service issued a new endpoint (pushsubscriptionchange
 *                in public/sw.js); the server row now carries it
 *   - "removed"  the member turned this device off from another one, or it was
 *                filed under another account — the browser unsubscribes too,
 *                instead of re-filing itself behind the member's back
 *
 * A device filed for a different account is left to PushSession, which
 * releases it.
 */
export function PushSync() {
  const { isLoaded, userId } = useAuth();

  useEffect(() => {
    if (!isLoaded || !userId) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const owner = deviceOwner();
    if (owner && owner !== userId) return;
    let cancelled = false;
    void (async () => {
      const sub = await currentSubscription();
      if (!sub || cancelled) return;
      const result = await reconcilePushSubscription(sub.toJSON(), lastEndpoint());
      if (cancelled || !result.ok) return;
      if (result.value === "removed") {
        await sub.unsubscribe().catch(() => false);
        forgetDevice();
      } else {
        rememberDevice(userId, sub.endpoint);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, userId]);
  return null;
}

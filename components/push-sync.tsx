"use client";

import { useEffect } from "react";
import { savePushSubscription } from "@/app/actions/push";
import { currentSubscription } from "@/lib/push/client";

/**
 * Keeps this device's subscription on file (F29). Push services rotate
 * endpoints, and a member who cleared the row from another device but kept
 * permission here should still hear about their rounds. Once per signed-in
 * page load, only when permission is already granted — this never prompts.
 */
export function PushSync() {
  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    let cancelled = false;
    void currentSubscription().then((sub) => {
      if (sub && !cancelled) void savePushSubscription(sub.toJSON());
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}

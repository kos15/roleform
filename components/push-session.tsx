"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { deviceOwner, releaseThisDevice } from "@/lib/services/push/client";

/**
 * Sign-out and account switching for push (F29.2). Mounted on every page,
 * signed in or not, because the page after a sign-out is a public one.
 *
 * If this device was filed for a member and nobody — or somebody else — is
 * signed in now, the device asks the server to forget it and unsubscribes.
 * The next member turns notifications on for themselves; a shared phone never
 * keeps showing the previous member's reminders. The server enforces the same
 * rule independently: an endpoint belongs to whoever filed it last, and the
 * outbox cancels anything queued for a device's previous owner.
 */
export function PushSession() {
  const { isLoaded, userId } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    const owner = deviceOwner();
    if (owner && owner !== userId) void releaseThisDevice();
  }, [isLoaded, userId]);
  return null;
}

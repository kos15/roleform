"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Bell, BellOff, Pause, Play, Send, Smartphone, X } from "lucide-react";
import { Button, Card, ErrorRegion, Tag } from "@/components/ui";
import { InstallApp } from "@/components/install-app";
import {
  removePushSubscription,
  savePushSubscription,
  sendTestNotification,
  setDeviceEnabled,
  setNotificationPrefs,
} from "@/app/actions/push";
import {
  currentSubscription,
  endpointKey,
  pushState,
  rememberDevice,
  subscribe,
  unsubscribe,
  type PushState,
} from "@/lib/services/push/client";

export interface DeviceView {
  id: string;
  key: string;
  deviceLabel: string;
  createdAt: string;
  lastSentAt: string | null;
  /** Paused devices keep their subscription but get nothing (F29.2). */
  enabled: boolean;
}

export interface NotifyPrefsView {
  notifyRounds: boolean;
  notifyStudy: boolean;
  notifyDetails: boolean;
}

const STATE_COPY: Record<PushState, string> = {
  unsupported:
    "This browser can't receive notifications. Chrome, Edge, Firefox and Samsung Internet can — and Safari on iPhone once Roleform is on your Home Screen.",
  "ios-update":
    "Notifications need iOS or iPadOS 16.4 or later — Apple added web app notifications then. Update in Settings → General → Software Update, then add Roleform to your Home Screen.",
  "ios-needs-install":
    "On iPhone and iPad (iOS/iPadOS 16.4 or later), notifications only work in Roleform opened from your Home Screen — not in a Safari tab.",
  unconfigured: "Notifications aren't switched on for this site yet.",
  denied:
    "Notifications are blocked for Roleform on this device. Allow them in your browser or phone settings, then come back.",
  off: "Get a reminder before each interview round you add, and before each study session you plan.",
  on: "This device gets your reminders. Delivery is up to your phone and its push service — a phone that's off or in Focus may show them late, or not at all.",
};

/**
 * F29 — notifications on this device, and the list of every device that has
 * them. The OS prompt is only ever shown from the Turn on button: a prompt
 * nobody asked for gets a reflexive "Block", and on iPhone it isn't allowed.
 */
export function NotificationsPanel({
  devices,
  prefs,
  compact = false,
}: {
  devices: DeviceView[];
  /** Shown on the full panel only. */
  prefs?: NotifyPrefsView;
  compact?: boolean;
}) {
  const router = useRouter();
  const { userId } = useAuth();
  const [state, setState] = useState<PushState | null>(null);
  const [thisKey, setThisKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const refresh = useCallback(async () => {
    setState(await pushState());
    const sub = await currentSubscription();
    setThisKey(sub ? await endpointKey(sub.endpoint) : null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const turnOn = () =>
    start(async () => {
      setError(null);
      setNotice(null);
      const sub = await subscribe();
      if (!sub) {
        await refresh();
        if (typeof Notification !== "undefined" && Notification.permission === "denied") {
          setError(STATE_COPY.denied);
        }
        return;
      }
      const saved = await savePushSubscription(sub);
      if (!saved.ok) {
        setError(saved.error.message);
        return;
      }
      if (userId && sub.endpoint) rememberDevice(userId, sub.endpoint);
      await refresh();
      router.refresh();
    });

  const turnOff = () =>
    start(async () => {
      setError(null);
      setNotice(null);
      const endpoint = await unsubscribe();
      if (endpoint) await removePushSubscription({ endpoint });
      await refresh();
      router.refresh();
    });

  const test = (later = false) =>
    start(async () => {
      setError(null);
      setNotice(null);
      const result = await sendTestNotification({ later });
      if (!result.ok) setError(result.error.message);
      else if (result.value.later)
        setNotice("Close or lock the app now — the test is queued for about 30 seconds from now.");
      else {
        // "Accepted" is all Web Push can tell us: the push service took it.
        // Whether the phone showed it, only the member can see.
        const { accepted, devices: total, retrying } = result.value;
        const plural = (n: number) => `${n} device${n === 1 ? "" : "s"}`;
        setNotice(
          accepted === total
            ? `Handed to the push service for ${plural(accepted)}. It should appear within seconds — if it doesn't, check the device's notification settings.`
            : `Handed over for ${accepted} of ${plural(total)}${retrying ? `; ${retrying} will be retried shortly` : ""}.`,
        );
      }
    });

  const toggleDevice = (device: DeviceView) =>
    start(async () => {
      setError(null);
      const result = await setDeviceEnabled(device.id, !device.enabled);
      if (!result.ok) setError(result.error.message);
      router.refresh();
    });

  const savePrefs = (next: NotifyPrefsView) =>
    start(async () => {
      setError(null);
      const result = await setNotificationPrefs(next);
      if (!result.ok) setError(result.error.message);
      router.refresh();
    });

  const remove = (device: DeviceView) =>
    start(async () => {
      setError(null);
      // Removing THIS device from the list has to unsubscribe the browser too,
      // or PushSync would quietly file it again on the next page load.
      if (device.key === thisKey) await unsubscribe();
      await removePushSubscription({ id: device.id });
      await refresh();
      router.refresh();
    });

  return (
    <Card className="rounded-[26px] p-6">
      <div className="mb-2 flex items-center gap-2.5">
        {state === "on" ? (
          <Bell className="lucide h-5 w-5" aria-hidden />
        ) : (
          <BellOff className="lucide h-5 w-5" aria-hidden />
        )}
        <h3 className="text-[17px]">Notifications</h3>
        {state === "on" ? <Tag tone="ink">On here</Tag> : null}
      </div>

      <p className="mb-4 text-sm leading-normal text-[var(--color-text-muted)]">
        {state ? STATE_COPY[state] : "Checking this device…"}
      </p>

      {error ? <ErrorRegion title="Notifications">{error}</ErrorRegion> : null}
      {notice ? (
        <p role="status" className="mb-3 text-sm font-bold">
          {notice}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2.5">
        {state === "off" ? (
          <Button size="sm" onClick={turnOn} busy={pending} disabled={pending}>
            <Bell className="lucide h-4 w-4" aria-hidden /> Turn on notifications
          </Button>
        ) : null}
        {state === "on" ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => test()} busy={pending} disabled={pending}>
              <Send className="lucide h-4 w-4" aria-hidden /> Send a test
            </Button>
            <Button size="sm" variant="secondary" onClick={() => test(true)} disabled={pending}>
              Test with the app closed
            </Button>
            <Button size="sm" variant="ghost" onClick={turnOff} disabled={pending}>
              Turn off here
            </Button>
          </>
        ) : null}
      </div>

      {!compact && prefs ? (
        <fieldset className="mt-5 border-t-[1.5px] border-[var(--color-line)] pt-4" disabled={pending}>
          <legend className="eyebrow mb-2.5">What to send</legend>
          <div className="space-y-2.5 text-sm">
            {(
              [
                ["notifyRounds", "Interview-round reminders", "Before each round you add, and a nudge after it."],
                ["notifyStudy", "Study-session alerts", "Just before each session in your study plan."],
                [
                  "notifyDetails",
                  "Show company and round names on the lock screen",
                  "Off: reminders only say a round is coming and when. Anyone holding your phone can read a lock screen.",
                ],
              ] as const
            ).map(([key, label, hint]) => (
              <label key={key} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 flex-none accent-[var(--color-text)]"
                  checked={prefs[key]}
                  onChange={(e) => savePrefs({ ...prefs, [key]: e.target.checked })}
                />
                <span>
                  <span className="font-bold">{label}</span>
                  <span className="block text-[var(--color-text-muted)]">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {state === "ios-needs-install" || state === "off" || state === "unsupported" ? (
        <div className="mt-4">
          <InstallApp />
        </div>
      ) : null}

      {!compact && devices.length > 0 ? (
        <div className="mt-5 border-t-[1.5px] border-[var(--color-line)] pt-4">
          <p className="eyebrow mb-2.5">Devices with notifications</p>
          <ul className="space-y-2">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 text-sm">
                <Smartphone className="lucide h-4 w-4 flex-none" aria-hidden />
                <span className="font-bold">{d.deviceLabel || "Device"}</span>
                {d.key === thisKey ? <Tag tone="outline">This device</Tag> : null}
                {d.enabled ? null : <Tag tone="outline">Paused</Tag>}
                <span className="text-[var(--color-text-muted)]">
                  since {new Date(d.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm ml-auto"
                  aria-label={`${d.enabled ? "Pause" : "Resume"} notifications on ${d.deviceLabel || "this device"}`}
                  onClick={() => toggleDevice(d)}
                  disabled={pending}
                >
                  {d.enabled ? (
                    <Pause className="lucide h-4 w-4" aria-hidden />
                  ) : (
                    <Play className="lucide h-4 w-4" aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-label={`Remove ${d.deviceLabel || "this device"} from notifications`}
                  onClick={() => remove(d)}
                  disabled={pending}
                >
                  <X className="lucide h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

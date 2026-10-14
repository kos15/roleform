"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Send, Smartphone, X } from "lucide-react";
import { Button, Card, ErrorRegion, Tag } from "@/components/ui";
import { InstallApp } from "@/components/install-app";
import { removePushSubscription, savePushSubscription, sendTestNotification } from "@/app/actions/push";
import { currentSubscription, endpointKey, pushState, subscribe, unsubscribe, type PushState } from "@/lib/push/client";

export interface DeviceView {
  id: string;
  key: string;
  deviceLabel: string;
  createdAt: string;
  lastSentAt: string | null;
}

const STATE_COPY: Record<PushState, string> = {
  unsupported:
    "This browser can't receive notifications. Chrome, Edge, Firefox and Samsung Internet can — and Safari on iPhone once Roleform is on your Home Screen.",
  "ios-needs-install": "On iPhone and iPad, notifications only work once Roleform is on your Home Screen.",
  unconfigured: "Notifications aren't switched on for this site yet.",
  denied:
    "Notifications are blocked for Roleform on this device. Allow them in your browser or phone settings, then come back.",
  off: "Get a reminder a day before, an hour before or 15 minutes before each interview round you add.",
  on: "This device gets your interview-round reminders.",
};

/**
 * F29 — notifications on this device, and the list of every device that has
 * them. The OS prompt is only ever shown from the Turn on button: a prompt
 * nobody asked for gets a reflexive "Block", and on iPhone it isn't allowed.
 */
export function NotificationsPanel({ devices, compact = false }: { devices: DeviceView[]; compact?: boolean }) {
  const router = useRouter();
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
        setNotice("Close or lock the app now — the test arrives in about 30 seconds.");
      else
        setNotice(
          result.value.delivered === result.value.devices
            ? `Sent to ${result.value.delivered} device${result.value.delivered === 1 ? "" : "s"}.`
            : `Sent to ${result.value.delivered} of ${result.value.devices} devices — the others didn't answer.`,
        );
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
        <h3 className="text-[17px]">Round reminders</h3>
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
                <span className="text-[var(--color-text-muted)]">
                  since {new Date(d.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm ml-auto"
                  aria-label={`Stop notifications on ${d.deviceLabel || "this device"}`}
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

/**
 * Browser-side push plumbing (F29). Imported only by client components.
 *
 * Every function tolerates a browser that has none of this — older Safari,
 * Firefox private windows, an in-app webview — by reporting `unsupported`
 * rather than throwing, so the panel can say why instead of breaking.
 */

export type PushState =
  | "unsupported" // no service worker / PushManager / Notification at all
  | "ios-update" // iPhone/iPad below iOS/iPadOS 16.4: no Web Push at all
  | "ios-needs-install" // iPhone/iPad Safari tab: push exists only once on the Home Screen
  | "unconfigured" // this deployment has no VAPID key
  | "denied" // the member said no at the OS prompt; only Settings can undo it
  | "off" // supported, not subscribed on this device
  | "on"; // subscribed on this device

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * iOS/iPadOS version from the user agent, or null when it doesn't say (iPadOS
 * in desktop mode reports a Mac UA — treated as new enough, since that mode
 * only exists on iPadOS 13+ and push is feature-detected anyway).
 */
export function iosVersion(): number | null {
  if (typeof navigator === "undefined") return null;
  const m = navigator.userAgent.match(/OS (\d+)[_.](\d+)/);
  if (!m || !/iPhone|iPad|iPod/.test(navigator.userAgent)) return null;
  return Number(m[1]) + Number(m[2]) / 100;
}

/** Apple shipped Web Push for Home Screen apps in iOS/iPadOS 16.4. */
export const IOS_PUSH_MIN = 16.04;

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function pushCapable(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
  } catch {
    return null;
  }
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushCapable()) return null;
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function pushState(): Promise<PushState> {
  const ios = iosVersion();
  if (ios !== null && ios < IOS_PUSH_MIN) return "ios-update";
  if (isIos() && !isStandalone()) return "ios-needs-install";
  if (!pushCapable()) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  const sub = await currentSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(current: ArrayBuffer | null, wanted: Uint8Array): boolean {
  if (!current) return true; // Not exposed by this browser: assume it matches.
  const bytes = new Uint8Array(current);
  return bytes.length === wanted.length && bytes.every((b, i) => b === wanted[i]);
}

/**
 * Asks the OS, then subscribes. Must run inside a tap handler — iOS refuses a
 * permission prompt that no gesture asked for.
 */
export async function subscribe(): Promise<PushSubscriptionJSON | null> {
  if (!pushCapable() || !VAPID_PUBLIC_KEY) return null;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  const reg = await registration();
  if (!reg) return null;
  await navigator.serviceWorker.ready;
  const key = keyBytes(VAPID_PUBLIC_KEY);
  let existing = await reg.pushManager.getSubscription();
  // A subscription made under an older VAPID key can never be signed for
  // again (the push service answers 403): drop it and subscribe afresh.
  if (existing && !sameKey(existing.options.applicationServerKey, key)) {
    await existing.unsubscribe().catch(() => false);
    existing = null;
  }
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
  return sub.toJSON();
}

/** Unsubscribes this device; returns the endpoint so the server row can go too. */
export async function unsubscribe(): Promise<string | null> {
  const sub = await currentSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => false);
  forgetDevice();
  return endpoint;
}

/*
 * Who this device's subscription was filed for, and under which endpoint
 * (F29.2). Kept in localStorage — an opaque Clerk id and the push endpoint,
 * both already on this device — so that:
 *
 *   - after sign-out, the device can ask the server to forget it
 *     (components/push-session.tsx), and stop showing someone else's
 *     reminders on a shared phone;
 *   - after the push service rotates the endpoint, the next app open can tell
 *     the server which row the new one replaces (reconcile).
 *
 * Every access is guarded: storage can be missing or throw (private windows).
 */
const OWNER_KEY = "rf:push-owner";
const ENDPOINT_KEY = "rf:push-endpoint";

function store(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // No storage: the server-side checks still hold, we just can't help.
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function rememberDevice(owner: string, endpoint: string): void {
  store(OWNER_KEY, owner);
  store(ENDPOINT_KEY, endpoint);
}

export function forgetDevice(): void {
  store(OWNER_KEY, null);
  store(ENDPOINT_KEY, null);
}

export function deviceOwner(): string | null {
  return read(OWNER_KEY);
}

export function lastEndpoint(): string | null {
  return read(ENDPOINT_KEY);
}

/**
 * Signed out (or switched account): ask the server to drop this device's row —
 * proving possession with the subscription's own auth secret, since there is
 * no session any more — then unsubscribe the browser. Best effort; never
 * throws.
 */
export async function releaseThisDevice(): Promise<void> {
  try {
    const sub = await currentSubscription();
    if (sub) {
      const json = sub.toJSON();
      if (json.endpoint && json.keys?.auth) {
        await fetch("/api/push/release", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: json.endpoint, auth: json.keys.auth }),
          keepalive: true,
        }).catch(() => null);
      }
      await sub.unsubscribe().catch(() => false);
    }
  } finally {
    forgetDevice();
  }
}

/** Same fingerprint as lib/db/queries/rounds.ts#endpointKey. */
export async function endpointKey(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

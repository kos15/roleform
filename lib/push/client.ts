/**
 * Browser-side push plumbing (F29). Imported only by client components.
 *
 * Every function tolerates a browser that has none of this — older Safari,
 * Firefox private windows, an in-app webview — by reporting `unsupported`
 * rather than throwing, so the panel can say why instead of breaking.
 */

export type PushState =
  | "unsupported" // no service worker / PushManager / Notification at all
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
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  return sub.toJSON();
}

/** Unsubscribes this device; returns the endpoint so the server row can go too. */
export async function unsubscribe(): Promise<string | null> {
  const sub = await currentSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => false);
  return endpoint;
}

/** Same fingerprint as lib/db/queries/rounds.ts#endpointKey. */
export async function endpointKey(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

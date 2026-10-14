/**
 * Web Push delivery rules (F29.2) — the pure half of the outbox.
 *
 * What a payload may contain, which push-service answers are worth a retry,
 * how long to wait before one, and how long a push is still worth sending.
 * The sender (lib/push/outbox.ts) does the I/O; every decision it makes about
 * a response is made here, so it can be checked without a phone
 * (scripts/push-fixtures.ts).
 *
 * This module is PURE. It imports nothing from db, ai, supabase or next.
 */
import { z } from "zod";

/** Attempts per device, including the first. Mirrors the CHECK (0–5). */
export const MAX_ATTEMPTS = 5;

/** Waits before attempts 2…5. Short first: most 5xx and timeouts are blips. */
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 45 * 60_000] as const;

/** A Retry-After longer than this is treated as "not within this push's life". */
const MAX_RETRY_AFTER_MS = 60 * 60_000;

/** How long a leased row is held before another sender may take it over. */
export const LEASE_MS = 90_000;

/**
 * An in-app path, or null. One leading "/", never "//" (protocol-relative),
 * never a backslash (WHATWG URL parsing turns "/\evil.com" into
 * "//evil.com"), no control characters, and it must resolve to the app's own
 * origin. Never "/api/…": a tap opens a page, it doesn't call an endpoint.
 * public/sw.js applies the same rule on the device; the DB CHECKs it too.
 */
export function inAppPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  const base = "https://app.invalid";
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }
  if (url.origin !== base) return null;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return null;
  return url.pathname + url.search + url.hash;
}

/**
 * The payload as it crosses into the outbox. Bounded to what a lock screen
 * shows and to what the DB CHECKs allow; a payload that fails is a bug in the
 * caller, so it is refused rather than trimmed.
 */
export const PushPayloadSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().max(240),
  url: z.string().refine((v) => inAppPath(v) === v, "must be an in-app path"),
  tag: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
});
export type PushPayload = z.infer<typeof PushPayloadSchema>;

/**
 * The Topic header (RFC 8030 §5.4): at most 32 URL-safe base64 characters.
 * Same topic replaces a not-yet-delivered message on the push service, so a
 * phone that was off for a day gets the latest reminder, not all of them.
 */
export function topicFor(tag: string): string {
  return tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "roleform";
}

/** Seconds the push service may hold it (TTL header). 0 once it has expired. */
export function ttlSeconds(expiresAt: Date, now: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}

export type SendOutcome =
  /** 2xx: the push service accepted it. Not "delivered", not "read". */
  | { kind: "accepted" }
  /** 404/410: the subscription is dead. Delete the device. */
  | { kind: "gone" }
  /** 429, 5xx, network error, timeout: worth another go. */
  | { kind: "retry"; retryAfterMs: number | null }
  /** Anything else (400, 401/403 VAPID mismatch, 413): retrying won't help. */
  | { kind: "fatal" };

/** Classifies a push-service answer. `status` null = no HTTP answer at all. */
export function classify(status: number | null, retryAfter?: string | null): SendOutcome {
  if (status === null) return { kind: "retry", retryAfterMs: null };
  if (status >= 200 && status < 300) return { kind: "accepted" };
  if (status === 404 || status === 410) return { kind: "gone" };
  if (status === 429 || status >= 500) return { kind: "retry", retryAfterMs: parseRetryAfter(retryAfter) };
  return { kind: "fatal" };
}

/** Retry-After as delta-seconds or an HTTP date; null if absent or nonsense. */
export function parseRetryAfter(value: string | null | undefined, now: Date = new Date()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.max(0, at - now.getTime());
}

/**
 * When to try again after `attempts` tries, or null to stop. Stops at
 * MAX_ATTEMPTS, and stops when the next try would land after the push has
 * expired — a reminder for a round already under way is worse than none.
 * A server's Retry-After wins over our schedule when it is longer, within an
 * hour.
 */
export function nextAttempt(
  attempts: number,
  outcome: Extract<SendOutcome, { kind: "retry" }>,
  expiresAt: Date,
  now: Date,
): Date | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  const scheduled = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length) - 1] ?? BACKOFF_MS[0];
  const asked = outcome.retryAfterMs !== null && outcome.retryAfterMs <= MAX_RETRY_AFTER_MS ? outcome.retryAfterMs : 0;
  const at = new Date(now.getTime() + Math.max(scheduled, asked));
  return at.getTime() < expiresAt.getTime() ? at : null;
}

/** What a member has switched on (F29.2). */
export interface NotifyPrefs {
  notifyRounds: boolean;
  notifyStudy: boolean;
  notifyDetails: boolean;
}

export type PushCategory = "round" | "study" | "test";

/** Whether a category may be queued at all for this member. Tests always may. */
export function categoryAllowed(category: PushCategory, prefs: NotifyPrefs): boolean {
  if (category === "round") return prefs.notifyRounds;
  if (category === "study") return prefs.notifyStudy;
  return true;
}

/** Study sessions, lock-screen safe: the topic stays in the app. */
export function discreetStudyCopy(): { title: string; body: string } {
  return { title: "Study session", body: "Your next study session is about to start. Open Roleform to begin." };
}

/** Counts for one sender pass. Logged as counts (N7) — never an endpoint. */
export interface OutboxSummary {
  leased: number;
  accepted: number;
  retrying: number;
  failed: number;
  expired: number;
  gone: number;
  cancelled: number;
}

export function emptySummary(): OutboxSummary {
  return { leased: 0, accepted: 0, retrying: 0, failed: 0, expired: 0, gone: 0, cancelled: 0 };
}

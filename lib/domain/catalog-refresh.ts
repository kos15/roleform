/**
 * PURE. The catalog re-check's TTL rules (N24, F8). Status moves one way: active → dead.
 */
import type { Liveness } from "@/lib/catalog/liveness";

export const CATALOG_TTL_DAYS = 7;
export const OVERDUE_DAYS = 30;
export const DAY_MS = 86_400_000;

export function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/** True once a link's last check is at least a full TTL old. */
export function isDue(checkedAt: Date, now: Date): boolean {
  return now.getTime() - checkedAt.getTime() >= CATALOG_TTL_DAYS * DAY_MS;
}

/** Only a conclusive dead verdict flips a link; live and blocked leave it active. */
export function nextStatus(current: "active", verdict: Liveness): "active" | "dead" {
  void current;
  return verdict === "dead" ? "dead" : "active";
}

/**
 * The status a link-checked seed may write. A new row is a curator's addition, so
 * live or blocked starts it active. An existing row is revived only by a
 * conclusive "live": "blocked" (403/429/timeout) is not evidence the page is back,
 * so it must never undo the daily cron's dead verdict (one-way rule, N8; hokage
 * ruling: a dead row stays dead until a link-checked re-seed finds its URL live).
 * null means leave status as it is. A dead verdict never reaches the upsert (the
 * seed skips it) but yields null regardless.
 */
export function seededStatus(verdict: Liveness, isNew: boolean): "active" | null {
  if (verdict === "live") return "active";
  if (verdict === "blocked" && isNew) return "active";
  return null;
}

/** The seed's stamp: row i is due i % 7 days from now's perspective, so a re-seed never makes the whole catalog due on one day. */
export function staggeredCheckedAt(now: Date, index: number): Date {
  return daysBefore(now, index % CATALOG_TTL_DAYS);
}

/** Does this write stamp verified_at? A new row always does (NOT NULL); an existing row only when the link was confirmed live. */
export function stampsVerifiedAt(verdict: Liveness | null, isNew: boolean): boolean {
  return isNew || verdict === "live";
}

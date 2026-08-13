/**
 * Who the caps apply to. PURE.
 *
 * Admins run this product without a ceiling. They are the people who set
 * everyone else's caps, they are the ones who have to reproduce a member's
 * failure to diagnose it, and an operator who cannot run the thing they operate
 * is a support problem rather than a policy.
 *
 * ── Unlimited is not untracked ──────────────────────────────────────────────
 * This is the distinction the whole module exists to hold. An uncapped account
 * still writes an `ai_runs` row for every model call, still appears in the cost
 * dashboard, and still shows its usage in the admin panel. What changes is only
 * that nothing ever refuses it.
 *
 * Cost observability is the reason `ai_runs` exists at all (specs §11), and a
 * role that silently stopped being measured would put the largest consumer of
 * the product outside the only number that tells you what it costs to run.
 *
 * ── Suspension still applies ────────────────────────────────────────────────
 * Deliberately not bypassed. Suspension is not a cap — it is somebody deciding
 * this account should stop generating, and "unlimited" quietly overriding a
 * deliberate block would be the opposite of what either setting means. An
 * uncapped account that is suspended is still suspended.
 */

import type { Role } from "./types";

/**
 * The cap value that means "no ceiling".
 *
 * `Infinity` rather than a large integer, so `used >= cap` is false for every
 * possible `used` without anybody having to pick a number that is big enough.
 * A sentinel like -1 or 999999 is a number that eventually gets compared,
 * formatted, or summed by code that does not know it is a sentinel.
 *
 * It never reaches the database: the columns keep their real values and their
 * CHECK constraints, and this is applied on read.
 */
export const UNCAPPED = Number.POSITIVE_INFINITY;

export function isUncapped(role: Role): boolean {
  return role === "admin";
}

/**
 * The cap actually in force, given who is asking.
 *
 * Every enforcement site reads its ceiling through this, so "admins are
 * uncapped" is one rule in one place rather than a condition remembered at five
 * seams — which is how the fifth seam gets forgotten.
 */
export function effectiveCap(role: Role, storedCap: number): number {
  return isUncapped(role) ? UNCAPPED : storedCap;
}

/** True when this account may proceed. `used` is measured either way. */
export function withinCap(role: Role, storedCap: number, used: number): boolean {
  return used < effectiveCap(role, storedCap);
}

/** How a cap reads on a surface. `Infinity` has no useful default rendering. */
export function formatCap(cap: number, zeroLabel = "Off"): string {
  if (cap === UNCAPPED) return "Unlimited";
  if (cap === 0) return zeroLabel;
  return String(cap);
}

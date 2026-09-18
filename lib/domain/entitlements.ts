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

import type { PlanId, Role } from "./types";

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

/**
 * How many résumé drafts a run will actually produce.
 *
 * The promise on the analyse screen and the number the pipeline renders have to
 * be the same number, so both read it here rather than each doing the clamp.
 * `catalogSize` is passed in because `lib/domain` may not import the template
 * table — it is a render concern, not a domain one.
 */
export function draftCount(role: Role, storedCap: number, catalogSize: number): number {
  const cap = isUncapped(role) ? catalogSize : storedCap;
  return Math.max(0, Math.min(cap, catalogSize));
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

/**
 * The plan actually in force (F23, PAY-2). PURE.
 *
 * A paid plan the row carries has lapsed the moment `planExpiresAt` is in the
 * past — no scheduler settles this (CLAUDE.md §8), so every reader of "what
 * plan is this member on" has to ask the question fresh, on read, against the
 * clock. This is the ONE function that is allowed to answer it: a member's
 * plan and caps are read through this everywhere except `lib/auth.ts#settlePlan`
 * (which writes the mirror back) and `lib/admin/members.ts` (which settles the
 * same way for the panel). A direct reader of `users.plan` anywhere else is a
 * bug (rules.md PAY-2).
 *
 * Free never lapses — `planExpiresAt` is null on Free by construction (the
 * `users_plan_expiry_pairing` CHECK), so the expiry check never applies to it.
 */
export function effectivePlan(
  row: { plan: PlanId; planExpiresAt: Date | null },
  now: Date = new Date(),
): PlanId {
  if (row.plan === "free") return "free";
  if (!row.planExpiresAt || row.planExpiresAt <= now) return "free";
  return row.plan;
}

/** True when a stored paid plan is currently unreachable through `effectivePlan`. */
export function planLapsed(
  row: { plan: PlanId; planExpiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  return row.plan !== "free" && effectivePlan(row, now) === "free";
}

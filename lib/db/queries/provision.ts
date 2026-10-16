import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { workspaceDefaults, capsFromDefaults } from "@/lib/admin/defaults";

/** N7: the address itself is never stored, only enough to de-duplicate. */
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase()).digest("hex");
}

/**
 * Create the account row for a Clerk subject if it doesn't exist yet.
 *
 * Three doors call this: the `user.created` webhook, `provisionUser` (a
 * signed-in person whose webhook hasn't landed) and the admin member list (a
 * Clerk account that never got a row at all — a webhook that was unconfigured
 * or failed when they signed up). One function so all three agree about what a
 * new account starts with (G19).
 *
 * Caps come from the workspace defaults (F15), not from the column defaults —
 * this is the only moment they apply. `update: {}` is what keeps that true: a
 * second call for an existing account must not re-apply a default over caps an
 * admin has since set by hand.
 *
 * Lives here rather than in `lib/auth.ts` because `lib/admin/members.ts`
 * needs it, and `lib/auth.ts` already imports from there (see plan.ts).
 */
export async function provisionAccount(clerkUserId: string, email: string): Promise<void> {
  const defaults = await workspaceDefaults();
  await db.user.upsert({
    where: { clerkUserId },
    create: {
      clerkUserId,
      emailHash: hashEmail(email),
      // The cycle anchor (F15, F19). Without it every read of `cycleStart`
      // falls back to `now`, usage counts from this instant, and no cap
      // binds — the meter and the seven caps become decorative. Written once,
      // at creation, and never moved: it is a fixed point the 30-day windows
      // are laid out around, not a date a scheduler has to maintain.
      quotaResetsAt: new Date(),
      ...capsFromDefaults(defaults),
    },
    update: {},
  });
}

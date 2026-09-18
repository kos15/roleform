import "server-only";
import { db } from "@/lib/db";
import { effectivePlan } from "@/lib/domain/entitlements";
import { planById } from "@/lib/content/pricing";

/**
 * Settle a lapsed plan (F23, PAY-2/PAY-3).
 *
 * `effectivePlan` (lib/domain/entitlements.ts) is the pure answer to "what
 * plan is this member really on right now"; this is the write-behind that
 * brings the stored row into agreement with it — the same shape
 * `lib/admin/role.ts#currentRole` already uses for the Clerk role mirror.
 *
 * Lives in `lib/db/queries/`, not `lib/auth.ts`, so both `lib/auth.ts`
 * (every allowance check) and `lib/admin/members.ts` (the panel, so an
 * admin never reads a stale plan) can call it without importing each other:
 * `lib/auth.ts` already imports `listAdmins` from `lib/admin/members.ts`,
 * so the reverse import would be a real circular dependency between two
 * modules whose functions are called, not just typed.
 *
 * There is no scheduler to do this on a timer (CLAUDE.md §8) — a plan lapses
 * the moment this next runs for that member, which is the next time they try
 * to do anything the plan gates, or the next time an admin opens the panel.
 * Admin overrides do not survive a lapse (D10): the row is reset to the Free
 * caps exactly as it is raised to a paid plan's caps on purchase, because a
 * second source of truth for "what this member's caps should be right now"
 * is how the two ever disagree.
 */
export async function settlePlan(clerkUserId: string): Promise<void> {
  const row = await db.user.findUnique({
    where: { clerkUserId },
    select: { plan: true, planExpiresAt: true },
  });
  if (!row || row.plan === "free") return;

  if (effectivePlan(row) !== "free") return;

  const free = planById("free").caps;
  await db.user.updateMany({
    // Scoped by the values just read, so a race — a purchase landing between
    // this read and this write — matches zero rows rather than clobbering it.
    where: { clerkUserId, plan: row.plan, planExpiresAt: row.planExpiresAt },
    data: {
      plan: "free",
      planExpiresAt: null,
      capTokens: free.tokens,
      capAnalyses: free.analyses,
      capResumes: free.resumes,
      capAnswers: free.answers,
      capCourses: free.courses,
      capRoadmaps: free.roadmaps,
      capJobSearches: free.jobSearches,
    },
  });
}

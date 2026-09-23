import "server-only";
import { db } from "@/lib/db";
import type { QuotaKey } from "@/lib/domain/quotas";
import { planById } from "@/lib/content/pricing";

/**
 * The caps a new account is provisioned with (F15).
 *
 * The admin header carries a "Workspace defaults" control. This is what it edits: the seven numbers a member
 * starts with, separate from the seven numbers each member currently holds.
 *
 * Reading is an upsert rather than a findUnique so the row exists from the
 * first read, on a fresh database, without a seed step. The column defaults in
 * the schema and the defaults here are deliberately the same numbers — the row
 * only starts meaning something once an admin changes it.
 *
 * Changing a default never rewrites an existing member. Their caps are their
 * own row and an admin who wants to move them has the per-member panel for it;
 * silently re-capping people who have been working under a number is the
 * generic failure this whole feature exists to remove.
 */
export type WorkspaceDefaults = Record<QuotaKey, number>;

export async function workspaceDefaults(): Promise<WorkspaceDefaults> {
  // Seeded from the FREE plan, not from the schema's column defaults (F17).
  // The pricing page publishes those seven numbers as what a free account
  // gets, and a new account that quietly started on the Pro numbers would
  // make that page wrong on its first sentence. Seeded once — an admin who
  // raises a default afterwards is not overwritten on the next read.
  const free = planById("free").caps;

  const row = await db.workspaceSettings.upsert({
    where: { id: "workspace" },
    create: {
      capTokens: free.tokens,
      capAnalyses: free.analyses,
      capResumes: free.resumes,
      capAnswers: free.answers,
      capCourses: free.courses,
      capRoadmaps: free.roadmaps,
      capJobSearches: free.jobSearches,
    },
    update: {},
    select: {
      capTokens: true,
      capAnalyses: true,
      capResumes: true,
      capAnswers: true,
      capCourses: true,
      capRoadmaps: true,
      capJobSearches: true,
    },
  });

  return {
    tokens: row.capTokens,
    analyses: row.capAnalyses,
    resumes: row.capResumes,
    answers: row.capAnswers,
    courses: row.capCourses,
    roadmaps: row.capRoadmaps,
    jobSearches: row.capJobSearches,
  };
}

/**
 * The workspace defaults, in the shape Prisma's `User.create` and the Clerk
 * webhook's create both need (G19).
 *
 * Before this there were two doors into a new account — `provisionUser` and
 * `user.created` — and only one of them read every column `workspaceDefaults`
 * returns; the webhook path wrote four of the (now seven) caps and left the
 * rest on the schema's column default. An admin who raised the workspace
 * token default saw it apply to a signup that came in through one door and
 * not the other. One function, used by both, is what makes "both doors agree
 * about what a new account starts with" (specs §14, F15) a fact rather than a
 * promise two call sites have to remember to keep in step.
 */
export function capsFromDefaults(defaults: WorkspaceDefaults) {
  return {
    capTokens: defaults.tokens,
    capAnalyses: defaults.analyses,
    capResumes: defaults.resumes,
    capAnswers: defaults.answers,
    capCourses: defaults.courses,
    capRoadmaps: defaults.roadmaps,
    capJobSearches: defaults.jobSearches,
  };
}

import "server-only";
import { db } from "@/lib/db";
import type { QuotaKey } from "@/lib/domain/quotas";
import { planById } from "@/lib/content/pricing";

/**
 * The caps a new account is provisioned with (F15).
 *
 * The design's admin header carries a "Workspace defaults" control beside
 * "View as a member". This is what it edits: the four numbers a member starts
 * with, separate from the four numbers each member currently holds.
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
  // The pricing page publishes those four numbers as what a free account gets,
  // and a new account that quietly started on the Pro numbers would make that
  // page wrong on its first sentence. Seeded once — an admin who raises a
  // default afterwards is not overwritten on the next read.
  const free = planById("free").caps;

  const row = await db.workspaceSettings.upsert({
    where: { id: "workspace" },
    create: {
      capAnalyses: free.analyses,
      capResumes: free.resumes,
      capAnswers: free.answers,
      capCourses: free.courses,
    },
    update: {},
    select: {
      capAnalyses: true,
      capResumes: true,
      capAnswers: true,
      capCourses: true,
    },
  });

  return {
    analyses: row.capAnalyses,
    resumes: row.capResumes,
    answers: row.capAnswers,
    courses: row.capCourses,
  };
}

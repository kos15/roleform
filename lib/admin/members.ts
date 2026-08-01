import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { initialsOf, roleFromMetadata, type Role } from "@/lib/admin/role";
import { cycleStart, type QuotaKey } from "@/lib/domain/quotas";
import type { PlanId } from "@/lib/content/pricing";

/**
 * The member list behind the admin panel (F15).
 *
 * Scope: one workspace, which in v1 is the whole install. There is no
 * organisation model yet, so `role = admin` is an operator role rather than a
 * per-tenant one. When organisations arrive this query grows a membership join
 * and nothing else about the panel changes — which is why the caps live on
 * `users` and not in a settings blob.
 *
 * Identity comes from Clerk, never from us. We store a hash of the address
 * (N7) precisely so that we cannot read one back, and an admin panel is not a
 * reason to start. Usage counts come from our tables; names, addresses and the
 * admin role come from Clerk at render time and are never written down here.
 */

/**
 * Usage read against the period each cap is actually enforced over, not one
 * shared window. `analyses` and `answers` accumulate across a billing cycle;
 * `resumes` and `courses` are per-run facts, so they report the last run. A
 * cycle total under a per-run cap would be a number that can only mislead.
 */
export interface MemberUsage {
  analyses: number;
  resumes: number;
  answers: number;
  courses: number;
}

export interface Member {
  clerkUserId: string;
  /** From Clerk. Falls back to the subject when the directory has no name. */
  name: string;
  email: string;
  initials: string;
  /** The row's own value, for anything that has to match a plan (lib/admin/plans.ts). */
  planId: PlanId;
  /** The same fact, spelled the way the panel prints it. */
  plan: string;
  role: Role;
  suspended: boolean;
  joined: string;
  caps: Record<QuotaKey, number>;
  used: MemberUsage;
}

export async function listMembers(): Promise<Member[]> {
  const rows = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      clerkUserId: true,
      plan: true,
      suspended: true,
      createdAt: true,
      quotaResetsAt: true,
      capAnalyses: true,
      capResumes: true,
      capAnswers: true,
      capCourses: true,
    },
  });

  if (rows.length === 0) return [];

  const usage = await Promise.all(
    rows.map((row) => usageFor(row.clerkUserId, cycleStart(row.quotaResetsAt))),
  );

  const directory = await resolveIdentities(rows.map((r) => r.clerkUserId));

  return rows.map((row, i) => {
    const person = directory.get(row.clerkUserId);
    const name = person?.name ?? "Unnamed member";
    return {
      clerkUserId: row.clerkUserId,
      name,
      email: person?.email ?? "—",
      initials: initialsOf(name),
      planId: row.plan === "pro" ? "pro" : "free",
      plan: row.plan === "pro" ? "Pro" : "Free",
      // From Clerk, not from the mirrored column: the mirror only refreshes
      // when a person visits, and a panel that shows a stale role is worse
      // than one that costs a directory read.
      role: person?.role ?? "member",
      suspended: row.suspended,
      joined: row.createdAt.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
      caps: {
        analyses: row.capAnalyses,
        resumes: row.capResumes,
        answers: row.capAnswers,
        courses: row.capCourses,
      },
      used: usage[i],
    };
  });
}

async function usageFor(clerkUserId: string, since: Date): Promise<MemberUsage> {
  const lastRun = await db.analysis.findFirst({
    where: { clerkUserId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const [analyses, answers, resumes, courses] = await Promise.all([
    db.analysis.count({ where: { clerkUserId, createdAt: { gte: since } } }),
    db.questionAnswer.count({ where: { clerkUserId, createdAt: { gte: since } } }),
    lastRun
      ? db.resumeDraft.count({ where: { clerkUserId, analysisId: lastRun.id } })
      : Promise.resolve(0),
    // Course matches are computed at read time, not stored, so the honest
    // per-run number is how many gaps that run produced — each of which draws
    // up to `capCourses` matches from the catalog.
    lastRun
      ? db.skillGap.count({ where: { clerkUserId, analysisId: lastRun.id } })
      : Promise.resolve(0),
  ]);

  return { analyses, resumes, answers, courses };
}

interface Identity {
  name: string;
  email: string;
  role: Role;
}

/**
 * One directory call for the whole page. Clerk pages at 500; past that this
 * needs a cursor loop, and past a few thousand members it needs a search box
 * instead of a list — both are the same change, and neither is due yet.
 */
async function resolveIdentities(userIds: string[]): Promise<Map<string, Identity>> {
  const map = new Map<string, Identity>();
  try {
    const client = await clerkClient();
    const list = await client.users.getUserList({ userId: userIds, limit: 500 });
    for (const u of list.data) {
      const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "";
      map.set(u.id, {
        name: name || "Unnamed member",
        email: u.primaryEmailAddress?.emailAddress ?? "—",
        role: roleFromMetadata(u.publicMetadata),
      });
    }
  } catch {
    // The panel is still useful without names — usage and caps are ours. It is
    // not useful with a stack trace, and the trace would carry subjects (N7).
  }
  return map;
}

export interface WorkspaceStat {
  label: string;
  value: number;
  /** The pooled ceiling this counts against, where one exists. */
  of: number | null;
  sub: string;
}

/**
 * The three numbers above the member list.
 *
 * Pooled totals over a rolling 30 days, against the sum of everyone's caps.
 * The pool is descriptive, not enforced — nothing refuses a run because the
 * workspace total is high, only because that member's own cap is. Saying so
 * here keeps the row from reading as a fourth cap.
 */
export async function workspaceStats(): Promise<WorkspaceStat[]> {
  const since = cycleStart(null);

  const [analyses, resumes, answers, caps] = await Promise.all([
    db.analysis.count({ where: { createdAt: { gte: since } } }),
    db.resumeDraft.count({ where: { createdAt: { gte: since } } }),
    db.questionAnswer.count({ where: { createdAt: { gte: since } } }),
    db.user.aggregate({ _sum: { capAnalyses: true, capAnswers: true } }),
  ]);

  return [
    {
      label: "Analyses this cycle",
      value: analyses,
      of: caps._sum.capAnalyses ?? 0,
      sub: `of ${caps._sum.capAnalyses ?? 0} pooled`,
    },
    {
      label: "Résumés rendered",
      value: resumes,
      of: null,
      sub: "across six templates",
    },
    {
      label: "Answers drafted",
      value: answers,
      of: caps._sum.capAnswers ?? 0,
      sub: `of ${caps._sum.capAnswers ?? 0} pooled`,
    },
  ];
}

// Who a 403 should point at now lives in lib/admin/role.ts, beside the source
// of truth it reads. Re-exported so callers have one import for "the admin
// question" rather than two.
export { listAdmins } from "@/lib/admin/role";

import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { initialsOf, roleFromMetadata, type Role } from "@/lib/admin/role";
import { cycleStart, type QuotaKey } from "@/lib/domain/quotas";
import { formatTokens } from "@/lib/domain/tokens";
import { effectivePlan } from "@/lib/domain/entitlements";
import { grantedTokens } from "@/lib/db/queries/tokens";
import { settlePlan } from "@/lib/db/queries/plan";
import { planById, type PlanId } from "@/lib/content/pricing";

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
 *
 * `tokens` is the cycle SUM over `ai_runs` — measured, not counted (F19).
 */
export interface MemberUsage {
  tokens: number;
  analyses: number;
  resumes: number;
  answers: number;
  courses: number;
  roadmaps: number;
  jobSearches: number;
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
  /** null on Free (never lapses) and on a plan just settled to Free this read. */
  planExpiresAt: string | null;
  role: Role;
  suspended: boolean;
  joined: string;
  caps: Record<QuotaKey, number>;
  used: MemberUsage;
  /** One-off tokens granted or bought, all time. Outside the cap. */
  topupTokens: number;
}

export async function listMembers(): Promise<Member[]> {
  const rows = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      clerkUserId: true,
      plan: true,
      planExpiresAt: true,
      suspended: true,
      createdAt: true,
      quotaResetsAt: true,
      capTokens: true,
      capAnalyses: true,
      capResumes: true,
      capAnswers: true,
      capCourses: true,
      capRoadmaps: true,
      capJobSearches: true,
    },
  });

  if (rows.length === 0) return [];

  // PAY-2: the panel never quotes a plan that has already lapsed. A row whose
  // stored plan disagrees with `effectivePlan` is settled — written back to
  // Free — before it is rendered, the same write `lib/auth.ts`'s allowance
  // checks perform the next time this member tries to do anything. Most rows
  // are unaffected and pass through unchanged.
  const settled = await Promise.all(
    rows.map(async (row) => {
      if (effectivePlan(row) === row.plan) return row;
      await settlePlan(row.clerkUserId);
      const free = planById("free").caps;
      return {
        ...row,
        plan: "free" as PlanId,
        planExpiresAt: null,
        capTokens: free.tokens,
        capAnalyses: free.analyses,
        capResumes: free.resumes,
        capAnswers: free.answers,
        capCourses: free.courses,
        capRoadmaps: free.roadmaps,
        capJobSearches: free.jobSearches,
      };
    }),
  );

  const [usage, topups] = await Promise.all([
    Promise.all(settled.map((row) => usageFor(row.clerkUserId, cycleStart(row.quotaResetsAt)))),
    // Granted, not unspent: the panel is answering "what has this member been
    // given", which is the number an admin deciding whether to grant more
    // actually needs. What is LEFT of it is the member's own header pill.
    Promise.all(settled.map((row) => grantedTokens(row.clerkUserId))),
  ]);

  const directory = await resolveIdentities(settled.map((r) => r.clerkUserId));

  return settled.map((row, i) => {
    const person = directory.get(row.clerkUserId);
    const name = person?.name ?? "Unnamed member";
    return {
      clerkUserId: row.clerkUserId,
      name,
      email: person?.email ?? "—",
      initials: initialsOf(name),
      planId: row.plan,
      plan: planById(row.plan).name,
      planExpiresAt: row.planExpiresAt
        ? row.planExpiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
        : null,
      // From Clerk, not from the mirrored column: the mirror only refreshes
      // when a person visits, and a panel that shows a stale role is worse
      // than one that costs a directory read.
      role: person?.role ?? "member",
      suspended: row.suspended,
      joined: row.createdAt.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
      caps: {
        tokens: row.capTokens,
        analyses: row.capAnalyses,
        resumes: row.capResumes,
        answers: row.capAnswers,
        courses: row.capCourses,
        roadmaps: row.capRoadmaps,
        jobSearches: row.capJobSearches,
      },
      used: usage[i],
      topupTokens: topups[i],
    };
  });
}

async function usageFor(clerkUserId: string, since: Date): Promise<MemberUsage> {
  const lastRun = await db.analysis.findFirst({
    where: { clerkUserId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const [tokens, analyses, answers, resumes, courses, roadmaps, jobSearches] = await Promise.all([
    db.aiRun.aggregate({
      where: { clerkUserId, createdAt: { gte: since } },
      _sum: { inputTokens: true, outputTokens: true },
    }),
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
    db.roadmap.count({ where: { clerkUserId, createdAt: { gte: since } } }),
    db.jobSearch.count({ where: { clerkUserId, createdAt: { gte: since } } }),
  ]);

  return {
    tokens: (tokens._sum.inputTokens ?? 0) + (tokens._sum.outputTokens ?? 0),
    analyses,
    resumes,
    answers,
    courses,
    roadmaps,
    jobSearches,
  };
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
  /** Six figures read as noise on a stat tile. */
  abbreviate?: boolean;
}

/**
 * The four numbers above the member list.
 *
 * Pooled totals over a rolling 30 days, against the sum of everyone's caps.
 * The pool is descriptive, not enforced — nothing refuses a run because the
 * workspace total is high, only because that member's own cap is. Saying so
 * here keeps the row from reading as a fourth cap.
 */
export async function workspaceStats(): Promise<WorkspaceStat[]> {
  const since = cycleStart(null);

  const [tokens, analyses, resumes, answers, caps] = await Promise.all([
    db.aiRun.aggregate({
      where: { createdAt: { gte: since } },
      _sum: { inputTokens: true, outputTokens: true },
    }),
    db.analysis.count({ where: { createdAt: { gte: since } } }),
    db.resumeDraft.count({ where: { createdAt: { gte: since } } }),
    db.questionAnswer.count({ where: { createdAt: { gte: since } } }),
    db.user.aggregate({ _sum: { capTokens: true, capAnalyses: true, capAnswers: true } }),
  ]);

  const tokensDrawn = (tokens._sum.inputTokens ?? 0) + (tokens._sum.outputTokens ?? 0);

  return [
    {
      // First, because it is the only one of these that measures cost rather
      // than count — and the only one an outage shows up in.
      label: "Tokens drawn",
      value: tokensDrawn,
      of: caps._sum.capTokens ?? 0,
      sub: `of ${formatTokens(caps._sum.capTokens ?? 0)} pooled`,
      abbreviate: true,
    },
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
      sub: "across eleven templates",
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

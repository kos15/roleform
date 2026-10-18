import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { initialsOf, roleFromMetadata, type Role } from "@/lib/admin/role";
import { cycleStart, type QuotaKey } from "@/lib/domain/quotas";
import { formatTokens } from "@/lib/domain/tokens";
import { effectivePlan } from "@/lib/domain/entitlements";
import { grantedTokens } from "@/lib/db/queries/tokens";
import { settlePlan } from "@/lib/db/queries/plan";
import { type PlanId } from "@/lib/content/pricing";
import { loadPlans } from "@/lib/plans/catalog";
import { capsFromDefaults, workspaceDefaults } from "@/lib/admin/defaults";
import { hashEmail } from "@/lib/email-hash";

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

/**
 * Lifetime facts about the account, for the detail card. Counts of rows the
 * member generated, never their content — the panel still does not read a
 * profile, a résumé or a posting.
 */
export interface MemberActivity {
  analysesTotal: number;
  /** Formatted server-side so the client never hydrates a different locale. */
  lastAnalysisAt: string | null;
  roadmapsTotal: number;
  jobSearchesTotal: number;
}

export interface Member {
  clerkUserId: string;
  /**
   * From Clerk: full name, else username, else the address's local part.
   * Only when the directory has no record does it fall back to a short form
   * of the subject — `nameSource` says which one this is.
   */
  name: string;
  nameSource: "directory" | "email" | "subject";
  email: string;
  emailVerified: boolean;
  initials: string;
  /** Clerk's own avatar URL — a Clerk-hosted image, never one we assemble. */
  imageUrl: string | null;
  /** How they sign in: "Google", "Password", … From Clerk. */
  signInMethods: string[];
  lastSignIn: string | null;
  lastActive: string | null;
  /** Banned or locked in Clerk — separate from our own `suspended`. */
  clerkBlocked: "banned" | "locked" | null;
  /** True when the directory answered and had no record for this subject. */
  missingFromDirectory: boolean;
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
  activity: MemberActivity;
  /** One-off tokens granted or bought, all time. Outside the cap. */
  topupTokens: number;
  /** The day the cycle caps are currently counted from. */
  cycleStartedAt: string;
}

export interface MemberList {
  members: Member[];
  /** False when every directory call failed — names are then short subjects. */
  directoryReachable: boolean;
  /** Accounts Clerk had and we had no row for, provisioned on this read. */
  syncedFromDirectory: number;
}

/**
 * Every visit to the panel reads the WHOLE Clerk directory — the instance the
 * deployment's `CLERK_SECRET_KEY` points at, so production on production — and
 * provisions a `users` row for anyone Clerk has and we don't.
 *
 * The `user.created` webhook and `provisionUser` are the two doors into an
 * account, and both are best-effort: a webhook never configured, or a person
 * who signed up and never came back, left someone in Clerk and missing here,
 * with no way for an admin to see them or set their caps. The row is what an
 * account looks like before its first visit — workspace-default caps, the same
 * cycle anchor — through `createMany({ skipDuplicates })`, so a row that
 * already exists is never touched and caps an admin set by hand stay set.
 */
export async function listMembers(): Promise<MemberList> {
  const directory = await readDirectory();
  const syncedFromDirectory = directory.complete ? await provisionMissing(directory.users) : 0;

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

  if (rows.length === 0) {
    return { members: [], directoryReachable: directory.reachable, syncedFromDirectory };
  }

  // PAY-2: the panel never quotes a plan that has already lapsed. A row whose
  // stored plan disagrees with `effectivePlan` is settled — written back to
  // Free — before it is rendered, the same write `lib/auth.ts`'s allowance
  // checks perform the next time this member tries to do anything. Most rows
  // are unaffected and pass through unchanged.
  const plans = await loadPlans();
  const planNamed = (id: PlanId) => plans.find((p) => p.id === id)!;
  const settled = await Promise.all(
    rows.map(async (row) => {
      if (effectivePlan(row) === row.plan) return row;
      await settlePlan(row.clerkUserId);
      const free = planNamed("free").caps;
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

  const [usage, topups, activity] = await Promise.all([
    Promise.all(settled.map((row) => usageFor(row.clerkUserId, cycleStart(row.quotaResetsAt)))),
    // Granted, not unspent: the panel is answering "what has this member been
    // given", which is the number an admin deciding whether to grant more
    // actually needs. What is LEFT of it is the member's own header pill.
    Promise.all(settled.map((row) => grantedTokens(row.clerkUserId))),
    Promise.all(settled.map((row) => activityFor(row.clerkUserId))),
  ]);

  // The full read already holds everyone; only when it was cut short are the
  // rows it missed looked up by id, batched as before.
  const lookedUp = directory.complete
    ? { identities: new Map<string, Identity>(), reachable: true }
    : await resolveIdentities(settled.map((r) => r.clerkUserId).filter((id) => !directory.identities.has(id)));
  const identities = new Map([...directory.identities, ...lookedUp.identities]);
  const reachable = directory.reachable || lookedUp.reachable;

  const members = settled.map((row, i): Member => {
    const person = identities.get(row.clerkUserId);
    const name = person?.name ?? shortSubject(row.clerkUserId);
    return {
      clerkUserId: row.clerkUserId,
      name,
      nameSource: person?.nameSource ?? "subject",
      email: person?.email ?? "—",
      emailVerified: person?.emailVerified ?? false,
      initials: person ? initialsOf(name) : "··",
      imageUrl: person?.imageUrl ?? null,
      signInMethods: person?.signInMethods ?? [],
      lastSignIn: person?.lastSignInAt ? formatMoment(new Date(person.lastSignInAt)) : null,
      lastActive: person?.lastActiveAt ? formatMoment(new Date(person.lastActiveAt)) : null,
      clerkBlocked: person?.blocked ?? null,
      // Only meaningful when the directory answered: an unreachable directory
      // says nothing about whether this person is in it.
      missingFromDirectory: reachable && !person,
      planId: row.plan,
      plan: planNamed(row.plan).name,
      planExpiresAt: row.planExpiresAt
        ? row.planExpiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
        : null,
      // From Clerk, not from the mirrored column: the mirror only refreshes
      // when a person visits, and a panel that shows a stale role is worse
      // than one that costs a directory read.
      role: person?.role ?? "member",
      suspended: row.suspended,
      joined: row.createdAt.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
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
      activity: activity[i],
      topupTokens: topups[i],
      cycleStartedAt: cycleStart(row.quotaResetsAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      }),
    };
  });

  return { members, directoryReachable: reachable, syncedFromDirectory };
}

/**
 * The sync alone, for admin panels that don't list members. Same rules as
 * `listMembers`: only a complete directory read provisions anyone.
 */
export async function syncFromDirectory(): Promise<{ synced: number; reachable: boolean }> {
  const directory = await readDirectory();
  return {
    synced: directory.complete ? await provisionMissing(directory.users) : 0,
    reachable: directory.reachable,
  };
}

/** Clerk's page ceiling. */
const DIRECTORY_PAGE = 500;
/** 100 pages = 50,000 accounts: a bound on one render, not a product limit. */
const DIRECTORY_MAX_PAGES = 100;

type DirectoryUser = Awaited<
  ReturnType<Awaited<ReturnType<typeof clerkClient>>["users"]["getUserList"]>
>["data"][number];

/**
 * The whole directory, paged. `complete` only when every page answered and the
 * last one came back short — anything less and nobody is provisioned off it,
 * because a partial list would read as "these are all the people there are".
 */
async function readDirectory(): Promise<{
  users: DirectoryUser[];
  identities: Map<string, Identity>;
  reachable: boolean;
  complete: boolean;
}> {
  const users: DirectoryUser[] = [];
  let reachable = false;
  let complete = false;
  try {
    const client = await clerkClient();
    for (let page = 0; page < DIRECTORY_MAX_PAGES; page++) {
      const batch = await client.users.getUserList({
        limit: DIRECTORY_PAGE,
        offset: page * DIRECTORY_PAGE,
        orderBy: "+created_at",
      });
      reachable = true;
      users.push(...batch.data);
      if (batch.data.length < DIRECTORY_PAGE || users.length >= batch.totalCount) {
        complete = true;
        break;
      }
    }
  } catch {
    // N7: no log line carrying subjects. The page says the directory was
    // unreachable, and the by-id lookup below still gets a chance.
  }
  return {
    users,
    identities: new Map(users.map((u) => [u.id, identityOf(u)])),
    reachable,
    complete,
  };
}

/** Rows for the directory's people we have never seen. Returns how many were new. */
async function provisionMissing(users: DirectoryUser[]): Promise<number> {
  if (users.length === 0) return 0;
  // Every id we hold, not an IN over the directory: a directory in the tens of
  // thousands would run past Postgres's bind-parameter limit.
  const known = new Set(
    (await db.user.findMany({ select: { clerkUserId: true } })).map((r) => r.clerkUserId),
  );
  const missing = users.filter((u) => !known.has(u.id));
  if (missing.length === 0) return 0;

  const caps = capsFromDefaults(await workspaceDefaults());
  const { count } = await db.user.createMany({
    data: missing.map((u) => {
      const email = (u.primaryEmailAddress ?? u.emailAddresses[0] ?? null)?.emailAddress ?? "";
      return {
        clerkUserId: u.id,
        // N7: the hash, never the address — the same as both other doors.
        emailHash: hashEmail(email),
        // Joined is when they signed up with Clerk, not when we noticed.
        createdAt: new Date(u.createdAt),
        quotaResetsAt: new Date(),
        ...caps,
      };
    }),
    skipDuplicates: true,
  });
  return count;
}

async function activityFor(clerkUserId: string): Promise<MemberActivity> {
  const [analyses, roadmapsTotal, jobSearchesTotal] = await Promise.all([
    db.analysis.aggregate({
      where: { clerkUserId },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    db.roadmap.count({ where: { clerkUserId } }),
    db.jobSearch.count({ where: { clerkUserId } }),
  ]);
  return {
    analysesTotal: analyses._count._all,
    lastAnalysisAt: analyses._max.createdAt ? formatMoment(analyses._max.createdAt) : null,
    roadmapsTotal,
    jobSearchesTotal,
  };
}

function formatMoment(date: Date): string {
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** `user_2abc…xyz` → `Member …xyz`: rows stay distinguishable without a name. */
function shortSubject(clerkUserId: string): string {
  return `Member …${clerkUserId.slice(-6)}`;
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
  nameSource: "directory" | "email";
  email: string;
  emailVerified: boolean;
  imageUrl: string | null;
  signInMethods: string[];
  lastSignInAt: number | null;
  lastActiveAt: number | null;
  blocked: "banned" | "locked" | null;
  role: Role;
}

/** Clerk's `user_id` filter rides in the query string; 100 per call keeps it short. */
const DIRECTORY_BATCH = 100;

/**
 * Directory reads for the whole page, batched. Each batch fails on its own, so
 * one bad call costs the names of at most one batch — a single all-or-nothing
 * call used to blank every name on the page at once.
 */
async function resolveIdentities(
  userIds: string[],
): Promise<{ identities: Map<string, Identity>; reachable: boolean }> {
  const identities = new Map<string, Identity>();
  let client: Awaited<ReturnType<typeof clerkClient>>;
  try {
    client = await clerkClient();
  } catch {
    return { identities, reachable: false };
  }

  const batches: string[][] = [];
  for (let i = 0; i < userIds.length; i += DIRECTORY_BATCH) {
    batches.push(userIds.slice(i, i + DIRECTORY_BATCH));
  }

  const results = await Promise.allSettled(
    batches.map((ids) => client.users.getUserList({ userId: ids, limit: ids.length })),
  );

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const u of result.value.data) identities.set(u.id, identityOf(u));
  }

  // Failures are swallowed rather than logged: the panel is still useful
  // without names — usage and caps are ours — and a trace would carry subjects
  // (N7). The page says the directory was unreachable instead.
  const reachable = results.length === 0 || results.some((r) => r.status === "fulfilled");
  return { identities, reachable };
}

function identityOf(u: DirectoryUser): Identity {
  const primary = u.primaryEmailAddress ?? u.emailAddresses[0] ?? null;
  const email = primary?.emailAddress ?? "";
  const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  const directoryName = fullName || u.username || "";
  return {
    // An email-code signup has no name at all; the address's local part is
    // what an admin would recognise them by.
    name: directoryName || email.split("@")[0] || "No name on file",
    nameSource: directoryName ? "directory" : "email",
    email: email || "—",
    emailVerified: primary?.verification?.status === "verified",
    imageUrl: u.hasImage ? u.imageUrl : null,
    signInMethods: signInMethods(u),
    lastSignInAt: u.lastSignInAt,
    lastActiveAt: u.lastActiveAt,
    blocked: u.banned ? "banned" : u.locked ? "locked" : null,
    role: roleFromMetadata(u.publicMetadata),
  };
}

function signInMethods(u: {
  passwordEnabled: boolean;
  externalAccounts: { provider: string }[];
}): string[] {
  const methods = u.externalAccounts.map((a) => {
    const provider = a.provider.replace(/^oauth_/, "");
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  });
  if (u.passwordEnabled) methods.push("Password");
  return methods.length > 0 ? [...new Set(methods)] : ["Email code"];
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

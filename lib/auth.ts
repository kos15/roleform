import "server-only";
import { createHash } from "node:crypto";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { listAdmins } from "@/lib/admin/members";
import { workspaceDefaults, capsFromDefaults } from "@/lib/admin/defaults";
import { cycleEnd, cycleStart, QUOTA_BY_KEY, type CapWall, type QuotaKey } from "@/lib/domain/quotas";
import { UNCAPPED, isUncapped, withinCap } from "@/lib/domain/entitlements";
import { accountTokens } from "@/lib/db/queries/tokens";
import { settlePlan } from "@/lib/db/queries/plan";
import {
  SPEND,
  TOKEN_STAGES,
  formatCount,
  formatResetDate,
  formatResetIn,
  shortfall,
  type SpendKind,
  type TokenWall,
} from "@/lib/domain/tokens";
import { canBuyTopup, planAbove, planById, TOPUPS, type PlanId } from "@/lib/content/pricing";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/** N7: the address itself is never stored, only enough to de-duplicate. */
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase()).digest("hex");
}

/**
 * Create the account row if the webhook hasn't yet.
 *
 * The Clerk `user.created` webhook is the primary path, but it is best-effort:
 * unconfigured locally, delayed behind a retry, or simply losing the race with
 * a user who signs up and clicks straight through. Every one of those leaves a
 * signed-in person with no row and no way to act. Idempotent upsert, so the
 * webhook arriving late is a no-op rather than a conflict.
 *
 * Caps come from the workspace defaults (F15), not from the column defaults —
 * this is the only moment they apply. `update: {}` is what keeps that true: a
 * second call for an existing account must not re-apply a default over caps an
 * admin has since set by hand.
 */
export async function provisionUser(clerkUserId: string): Promise<void> {
  const clerk = await currentUser();
  const email =
    clerk?.primaryEmailAddress?.emailAddress ?? clerk?.emailAddresses?.[0]?.emailAddress ?? "";

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

// `settlePlan` (F23, PAY-2/PAY-3) lives in lib/db/queries/plan.ts, imported
// above — not here, because this module already imports `listAdmins` from
// lib/admin/members.ts, and lib/admin/members.ts needs `settlePlan` too
// (PAY-2: the panel never reads a stale plan). Defining it in this file
// would make that a real circular import between two modules whose
// functions are called at runtime, not just referenced for their types.

/**
 * The token meter, checked before the work starts (F19).
 *
 * **Before, not during.** A run that stops half-way has still spent everything
 * it burned getting there, and charging for a résumé nobody received is the
 * one failure mode this whole feature is meant to prevent. So the estimate is
 * compared to the balance up front, and a run we cannot afford to finish is
 * never begun. That is what the pricing page's refusal list promises, and this
 * function is where the promise is kept.
 *
 * A refusal carries the whole wall — balance, shortfall, reset date, and every
 * exit including the free one. The caller opens a dialog with it rather than
 * printing a sentence, because "you have run out" with no way forward is the
 * generic failure with extra steps. Success carries nothing: the balance is not
 * the caller's business, and returning it would invite a second opinion about
 * whether the run can go ahead.
 *
 * Suspension is checked by the per-action allowance functions below, not here:
 * a suspended account has not run out of tokens, and offering it a top-up
 * would sell someone a fix for a problem they don't have.
 */
export async function checkTokenAllowance(
  clerkUserId: string,
  kind: SpendKind,
): Promise<Result<null>> {
  // Settled first (PAY-2): a lapsed Pro member's balance is read against the
  // Free allowance, not the plan they stopped paying for last cycle.
  await settlePlan(clerkUserId);

  // Admins are uncapped (lib/domain/entitlements.ts). Checked before the
  // balance is read, because the balance is an aggregate over `ai_runs` and
  // there is no point paying for a number nothing is going to compare against.
  //
  // The run still writes its `ai_runs` rows, so the spend remains visible in
  // the dashboard and the ledger — uncapped, not unmeasured.
  const row = await db.user.findUnique({ where: { clerkUserId }, select: { role: true } });
  if (row && isUncapped(row.role)) return ok(null);

  const account = await accountTokens(clerkUserId);
  if (!account) return err(appError("not_found", "We couldn't find your account."));

  const short = shortfall(account.balance, kind);

  // The wall is built only on the refusal path. It costs a plan read and the
  // whole offer list, and this function sits in front of every analysis and
  // every drafted answer — paying for a dialog the common case never opens
  // would be a query per run to describe something that didn't happen.
  if (short === 0) return ok(null);

  const wall = await buildWall(clerkUserId, kind, account, short);
  const spend = SPEND[kind];
  return err({
    code: "token_wall",
    message:
      account.balance.total === 0
        ? `Your token allowance is set to zero${await askWhom()}.`
        : `${spend.noun} needs about ${formatCount(spend.estimate)} tokens and you have ${formatCount(account.balance.left)}. Your cycle resets on ${wall.resetDate}.`,
    wall,
  });
}

async function buildWall(
  clerkUserId: string,
  kind: SpendKind,
  account: NonNullable<Awaited<ReturnType<typeof accountTokens>>>,
  short: number,
): Promise<TokenWall> {
  const row = await db.user.findUnique({ where: { clerkUserId }, select: { plan: true } });
  const planId = (row?.plan ?? "free") as PlanId;
  const up = planAbove(planId);

  return {
    kind,
    estimate: SPEND[kind].estimate,
    shortfall: short,
    balance: account.balance,
    planName: planById(planId).name,
    stages: TOKEN_STAGES,
    resetDate: formatResetDate(account.resetsAt),
    resetIn: formatResetIn(account.resetsAt),
    // Only an analysis carries a stored posting to come back to.
    canQueue: kind === "analysis",
    upgrade: up
      ? {
          id: up.id,
          name: up.name,
          price: up.price,
          tokens: up.caps.tokens,
          note: `${formatCount(up.caps.tokens)} tokens a cycle instead of ${formatCount(account.balance.allowance)}, available the moment you switch.`,
        }
      : null,
    topups: canBuyTopup(planId)
      ? TOPUPS.map((t) => ({
          id: t.id,
          name: `${formatCount(t.tokens)} tokens`,
          price: t.price,
          tokens: t.tokens,
          note: `${t.note}. One-off — nothing renews, and anything unspent carries into the next cycle.`,
        }))
      : [],
  };
}

/**
 * Session subject for a Server Action.
 *
 * Every action calls this and scopes its queries by the result. RLS is the
 * second lock (CLAUDE.md §7) — this is the first one, and the Prisma
 * connection bypasses RLS, so skipping it is a data leak, not a style issue.
 */
export async function requireUser(): Promise<Result<string>> {
  const { userId } = await auth();
  if (!userId) return err(appError("unauthenticated", "Please sign in."));
  return ok(userId);
}

/**
 * Analyses allowance (M7.2, F15). Exhaustion blocks NEW analyses only — past
 * analyses stay fully readable. We never lock a user out of their own data
 * (specs §13).
 *
 * Counted from the `analyses` table rather than decremented from a balance.
 * That is the whole reason the refund path is gone: a run that fails to start
 * leaves no row, so there is nothing to give back, and the two ways a balance
 * could drift — a crash between decrement and insert, and a refund that fires
 * twice — stop being representable.
 *
 * The refusal names the cap and the admins who can raise it. A generic "quota
 * exceeded" is the failure this feature exists to remove (F15).
 */
export async function checkAnalysisAllowance(
  clerkUserId: string,
): Promise<Result<{ used: number; cap: number }>> {
  // Settled first (PAY-2): a lapsed member is checked against Free's cap,
  // not a plan nobody is still paying for.
  await settlePlan(clerkUserId);

  let row = await db.user.findUnique({
    where: { clerkUserId },
    select: { capAnalyses: true, suspended: true, quotaResetsAt: true, role: true, plan: true },
  });

  // A signed-in subject with no row means the webhook hasn't landed. Provision
  // rather than refuse — the session is proof the account exists.
  if (!row) {
    await provisionUser(clerkUserId);
    row = await db.user.findUnique({
      where: { clerkUserId },
      select: { capAnalyses: true, suspended: true, quotaResetsAt: true, role: true, plan: true },
    });
  }

  if (!row) return err(appError("not_found", "We couldn't find your account."));

  if (row.suspended) {
    return err(
      appError(
        "quota_exhausted",
        `Generation is suspended on your account${await askWhom()}. Everything you've already run stays readable.`,
      ),
    );
  }

  const used = await db.analysis.count({
    where: { clerkUserId, createdAt: { gte: cycleStart(row.quotaResetsAt) } },
  });

  // Suspension is checked above and is NOT bypassed for an uncapped account:
  // it is a deliberate block, not a ceiling (lib/domain/entitlements.ts).
  if (!withinCap(row.role, row.capAnalyses, used)) {
    // PAY-4/PAY-5: every cap refusal carries the value it was raised from, so
    // the UI can open the same dialog the token wall does rather than a plain
    // sentence with nowhere to go.
    const capWall = await buildCapWall(clerkUserId, "analyses", row.capAnalyses, used, row.quotaResetsAt, row.plan);
    return err({
      ...appError(
        "quota_exhausted",
        row.capAnalyses === 0
          ? `Your JD analyses cap is set to zero${await askWhom()}.`
          : `You've used all ${row.capAnalyses} JD analyses in this cycle${await askWhom()}. Your existing analyses stay available.`,
      ),
      capWall,
    });
  }

  return ok({ used, cap: isUncapped(row.role) ? UNCAPPED : row.capAnalyses });
}

/**
 * Answer-draft allowance (F15).
 *
 * Same shape as the analyses cap and for the same reason: counted from the
 * rows that exist, so a draft that fails to save costs nothing. Frameworks are
 * free at every cap — only a full drafted answer counts, which is what the
 * admin panel's description promises.
 */
export async function checkAnswerAllowance(
  clerkUserId: string,
): Promise<Result<{ used: number; cap: number }>> {
  await settlePlan(clerkUserId);

  const row = await db.user.findUnique({
    where: { clerkUserId },
    select: { capAnswers: true, suspended: true, quotaResetsAt: true, role: true, plan: true },
  });
  if (!row) return err(appError("not_found", "We couldn't find your account."));

  if (row.suspended) {
    return err(
      appError(
        "quota_exhausted",
        `Generation is suspended on your account${await askWhom()}. The questions and their frameworks stay readable.`,
      ),
    );
  }

  const used = await db.questionAnswer.count({
    where: { clerkUserId, createdAt: { gte: cycleStart(row.quotaResetsAt) } },
  });

  if (!withinCap(row.role, row.capAnswers, used)) {
    const capWall = await buildCapWall(clerkUserId, "answers", row.capAnswers, used, row.quotaResetsAt, row.plan);
    return err({
      ...appError(
        "quota_exhausted",
        row.capAnswers === 0
          ? `Full answer drafts are switched off on your account${await askWhom()}. Every question still shows its framework and the bullets to answer from.`
          : `You've used all ${row.capAnswers} full answer drafts in this cycle${await askWhom()}. Frameworks stay free, and answers you've already drafted stay readable.`,
      ),
      capWall,
    });
  }

  return ok({ used, cap: isUncapped(row.role) ? UNCAPPED : row.capAnswers });
}

/**
 * Roadmap build allowance (F21, F15). Same shape as the two caps above:
 * counted from rows, so an attempt refused up front costs nothing. A roadmap
 * already built stays readable and tickable at any cap (RM-5) — this only
 * guards a NEW build.
 */
export async function checkRoadmapAllowance(
  clerkUserId: string,
): Promise<Result<{ used: number; cap: number }>> {
  return checkCap(clerkUserId, "roadmaps", (uid, since) =>
    db.roadmap.count({ where: { clerkUserId: uid, createdAt: { gte: since } } }),
  );
}

/**
 * Job search allowance (F22, F15). Off (cap 0) on Free — the wall is what a
 * Free member sees on `/jobs` before any outbound request is made (JS-9).
 * A repeat query inside the 12h cache window (JS-4) writes no `job_searches`
 * row, so it is invisible to this count and costs nothing against the cap.
 */
export async function checkJobSearchAllowance(
  clerkUserId: string,
): Promise<Result<{ used: number; cap: number }>> {
  return checkCap(clerkUserId, "jobSearches", (uid, since) =>
    db.jobSearch.count({ where: { clerkUserId: uid, createdAt: { gte: since } } }),
  );
}

/**
 * The shared shape behind `checkRoadmapAllowance` and `checkJobSearchAllowance`
 * — both are cyclical, count-based caps with no cost or content-specific
 * refusal copy, unlike analyses and answers (which keep their own bespoke
 * wording above, and predate this helper). `countUsage` takes the table to
 * count from, because the two caps count different rows and `lib/auth.ts`
 * is not the place to teach a generic function about every table in the
 * schema.
 */
async function checkCap(
  clerkUserId: string,
  key: Extract<QuotaKey, "roadmaps" | "jobSearches">,
  countUsage: (clerkUserId: string, since: Date) => Promise<number>,
): Promise<Result<{ used: number; cap: number }>> {
  await settlePlan(clerkUserId);

  const row = await db.user.findUnique({
    where: { clerkUserId },
    select: {
      capRoadmaps: true,
      capJobSearches: true,
      suspended: true,
      quotaResetsAt: true,
      role: true,
      plan: true,
    },
  });
  if (!row) return err(appError("not_found", "We couldn't find your account."));

  const cap = key === "roadmaps" ? row.capRoadmaps : row.capJobSearches;
  const def = QUOTA_BY_KEY[key];

  if (row.suspended) {
    return err(
      appError(
        "quota_exhausted",
        `Generation is suspended on your account${await askWhom()}. Everything you've already built or saved stays readable.`,
      ),
    );
  }

  const since = cycleStart(row.quotaResetsAt);
  const used = await countUsage(clerkUserId, since);

  if (!withinCap(row.role, cap, used)) {
    const capWall = await buildCapWall(clerkUserId, key, cap, used, row.quotaResetsAt, row.plan);
    const noun = key === "roadmaps" ? "roadmaps" : "job searches";
    return err({
      code: "cap_wall",
      message:
        cap === 0
          ? `${def.label} are off on your account${await askWhom()}.`
          : `You've used all ${cap} ${noun} in this cycle${await askWhom()}.`,
      capWall,
    });
  }

  return ok({ used, cap: isUncapped(row.role) ? UNCAPPED : cap });
}

/**
 * Everything a cap-refusal dialog needs (F23, PAY-4/PAY-5) — the mirror of
 * `buildWall` above, for the four cyclical count-based caps rather than the
 * token meter. Built only on the refusal path, same reasoning as `buildWall`:
 * paying for a plan read and the admin list on every successful check would
 * be a query per run to describe something that didn't happen.
 */
async function buildCapWall(
  clerkUserId: string,
  key: Extract<QuotaKey, "analyses" | "answers" | "roadmaps" | "jobSearches">,
  cap: number,
  used: number,
  quotaResetsAt: Date | null,
  planId: PlanId,
): Promise<CapWall> {
  const def = QUOTA_BY_KEY[key];
  const up = planAbove(planId);
  const admins = await listAdmins();

  return {
    key,
    label: def.label,
    period: def.period,
    cap,
    used,
    resetDate: formatResetDate(cycleEnd(quotaResetsAt)),
    resetIn: formatResetIn(cycleEnd(quotaResetsAt)),
    upgrade: up ? { id: up.id, name: up.name, price: up.price, cap: up.caps[key] } : null,
    admins: admins.map((a) => a.name),
  };
}

/**
 * " — ask Devika Nair or Rahul Sen to raise it", or nothing when we genuinely
 * don't know who to point at. Only called on the refusal path, so the identity
 * lookup costs nothing in the common case.
 */
async function askWhom(): Promise<string> {
  const admins = await listAdmins();
  if (admins.length === 0) return "";
  const names = admins.map((a) => a.name);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
  return ` — ask ${list} to raise it`;
}

import "server-only";
import { createHash } from "node:crypto";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { listAdmins } from "@/lib/admin/members";
import { workspaceDefaults } from "@/lib/admin/defaults";
import { cycleStart } from "@/lib/domain/quotas";
import { accountTokens } from "@/lib/db/queries/tokens";
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
      // binds — the meter and the four caps become decorative. Written once,
      // at creation, and never moved: it is a fixed point the 30-day windows
      // are laid out around, not a date a scheduler has to maintain.
      quotaResetsAt: new Date(),
      capTokens: defaults.tokens,
      capAnalyses: defaults.analyses,
      capResumes: defaults.resumes,
      capAnswers: defaults.answers,
      capCourses: defaults.courses,
    },
    update: {},
  });
}

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
  let row = await db.user.findUnique({
    where: { clerkUserId },
    select: { capAnalyses: true, suspended: true, quotaResetsAt: true },
  });

  // A signed-in subject with no row means the webhook hasn't landed. Provision
  // rather than refuse — the session is proof the account exists.
  if (!row) {
    await provisionUser(clerkUserId);
    row = await db.user.findUnique({
      where: { clerkUserId },
      select: { capAnalyses: true, suspended: true, quotaResetsAt: true },
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

  if (used >= row.capAnalyses) {
    return err(
      appError(
        "quota_exhausted",
        row.capAnalyses === 0
          ? `Your JD analyses cap is set to zero${await askWhom()}.`
          : `You've used all ${row.capAnalyses} JD analyses in this cycle${await askWhom()}. Your existing analyses stay available.`,
      ),
    );
  }

  return ok({ used, cap: row.capAnalyses });
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
  const row = await db.user.findUnique({
    where: { clerkUserId },
    select: { capAnswers: true, suspended: true, quotaResetsAt: true },
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

  if (used >= row.capAnswers) {
    return err(
      appError(
        "quota_exhausted",
        row.capAnswers === 0
          ? `Full answer drafts are switched off on your account${await askWhom()}. Every question still shows its framework and the bullets to answer from.`
          : `You've used all ${row.capAnswers} full answer drafts in this cycle${await askWhom()}. Frameworks stay free, and answers you've already drafted stay readable.`,
      ),
    );
  }

  return ok({ used, cap: row.capAnswers });
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

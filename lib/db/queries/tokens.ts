import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { CYCLE_DAYS, cycleEnd, cycleStart } from "@/lib/domain/quotas";
import { tokenBalance, type TokenBalance } from "@/lib/domain/tokens";

/**
 * What the member has left (F19).
 *
 * **Nothing here is stored.** The allowance is a cap on `users`; everything
 * else is measured — usage from `ai_runs`, top-ups from `token_grants`. There
 * is no counter to decrement, so no crash between two writes can drift the
 * balance, and a run that dies half-way costs exactly the tokens it burned.
 * Same rule that removed the analyses refund path (lib/auth.ts).
 *
 * `ai_runs` rows are written even when a call fails (lib/ai/run.ts records a
 * schema-invalid run with zero tokens), so a failed stage contributes its real
 * cost and nothing more. That is the honest answer to "was I charged for the
 * run that broke": yes, for the tokens it actually spent.
 */
export interface AccountTokens {
  balance: TokenBalance;
  /** When the allowance refills. Named in every refusal. */
  resetsAt: Date;
  /** Generation is off entirely; the wall is not the right refusal. */
  suspended: boolean;
}

/**
 * Memoised per request. The header pill and the low-balance banner both want
 * this and render in separate Suspense boundaries, and two independent callers
 * asking the same question in one render should not be four queries.
 */
export const accountTokens = cache(async function accountTokens(
  clerkUserId: string,
): Promise<AccountTokens | null> {
  const user = await db.user.findUnique({
    where: { clerkUserId },
    select: { capTokens: true, quotaResetsAt: true, suspended: true },
  });
  if (!user) return null;

  const anchor = cycleStart(user.quotaResetsAt);
  const [byCycle, granted] = await Promise.all([
    usageByCycle(clerkUserId, anchor),
    grantedTokens(clerkUserId),
  ]);

  return {
    balance: tokenBalance({
      allowance: user.capTokens,
      topups: unspentTopups(granted, byCycle, user.capTokens),
      used: byCycle.current,
    }),
    resetsAt: cycleEnd(user.quotaResetsAt),
    suspended: user.suspended,
  };
});

/** Every top-up ever granted, summed. What has been SPENT of it is separate. */
export async function grantedTokens(clerkUserId: string): Promise<number> {
  const totals = await db.tokenGrant.aggregate({
    where: { clerkUserId },
    _sum: { tokens: true },
  });
  return totals._sum.tokens ?? 0;
}

export async function tokensUsedThisCycle(
  clerkUserId: string,
  quotaResetsAt: Date | null,
): Promise<number> {
  const totals = await db.aiRun.aggregate({
    where: { clerkUserId, createdAt: { gte: cycleStart(quotaResetsAt) } },
    _sum: { inputTokens: true, outputTokens: true },
  });
  return (totals._sum.inputTokens ?? 0) + (totals._sum.outputTokens ?? 0);
}

/* ----------------------------------------------------------- the carry rule */

export interface CycleUsage {
  /** Tokens drawn in the cycle running now. */
  current: number;
  /** Tokens drawn in each COMPLETED cycle, oldest first. */
  past: number[];
}

/**
 * Usage bucketed into 30-day cycles, in one query.
 *
 * This exists because of one promise on the pricing page: **the plan allowance
 * does not roll over, but an unspent top-up does.** Honouring that means
 * knowing how much of each past cycle overran its allowance — an overrun is
 * the only thing that can have eaten into the pool.
 *
 * Doing it by measurement rather than by a `topup_spent` counter keeps the
 * whole feature stored-state-free. The alternative is a column two writes can
 * disagree about, updated on a read path, which is exactly the shape of bug
 * this codebase keeps refusing to introduce.
 *
 * Bucketing is `floor((created_at − anchor) / 30 days)`, negative for anything
 * before the anchor — which is why the sign is preserved and only the
 * strictly-earlier buckets count as past.
 */
async function usageByCycle(clerkUserId: string, anchor: Date): Promise<CycleUsage> {
  const rows = await db.$queryRaw<{ bucket: number; used: bigint }[]>`
    select
      floor(extract(epoch from (ai."created_at" - ${anchor}::timestamptz)) / ${CYCLE_DAYS * 86400})::int
        as bucket,
      sum(ai."input_tokens" + ai."output_tokens")::bigint as used
    from "ai_runs" ai
    where ai."clerk_user_id" = ${clerkUserId}
    group by 1
    order by 1 asc
  `;

  let current = 0;
  const past: number[] = [];
  for (const row of rows) {
    const used = Number(row.used);
    if (row.bucket >= 0) current += used;
    else past.push(used);
  }
  return { current, past };
}

/**
 * What is left of the pool.
 *
 * A cycle draws from the plan allowance first and only then from top-ups, so
 * the pool is only touched by the amount a cycle went OVER its allowance. The
 * current cycle's overrun counts too — otherwise a member could spend the same
 * pack twice by watching the balance mid-cycle.
 *
 * The allowance used for past cycles is the CURRENT cap, not the cap in force
 * at the time. We do not keep a history of cap changes, and inventing one to
 * settle a top-up would be a bigger lie than the approximation: an admin who
 * raises a cap makes past overruns look smaller, which errs toward leaving the
 * member more tokens rather than fewer.
 */
export function unspentTopups(granted: number, usage: CycleUsage, allowance: number): number {
  const overrun = (used: number) => Math.max(0, used - allowance);
  const spent = usage.past.reduce((sum, used) => sum + overrun(used), 0) + overrun(usage.current);
  return Math.max(0, granted - spent);
}

/* ---------------------------------------------------------------- the queue */

/**
 * The postings filed against a wall, oldest first (F19).
 *
 * Nothing runs these on a schedule. They surface on /analyze when the member
 * comes back with a balance that can afford them — which is the honest version
 * of "we'll start it for you" for a product with no worker (CLAUDE.md §8), and
 * the reason the modal says "waiting for you" rather than "we'll email you".
 */
export interface QueuedRun {
  id: string;
  label: string;
  queuedAt: Date;
}

export async function queuedRuns(clerkUserId: string): Promise<QueuedRun[]> {
  const rows = await db.analysis.findMany({
    where: { clerkUserId, queuedAt: { not: null }, status: "parsing" },
    orderBy: { queuedAt: "asc" },
    select: { id: true, company: true, title: true, queuedAt: true, jdFilename: true },
  });

  return rows.map((r) => ({
    id: r.id,
    // A queued run has not been read yet, so it has no company or title — the
    // filename is usually all we have, and "Your posting" is what's left.
    label: [r.company, r.title].filter(Boolean).join(" · ") || r.jdFilename || "Your posting",
    queuedAt: r.queuedAt!,
  }));
}

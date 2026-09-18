/**
 * The token meter (F19). PURE.
 *
 * **Why a token allowance at all, when F15 already caps analyses?** Because the
 * four caps measure the wrong thing. An analysis of a 400-word posting and an
 * analysis of a six-page one are one unit each to `capAnalyses`, and they are
 * not remotely the same amount of work. The meter is the honest one: it counts
 * what the models actually consumed.
 *
 * **Usage is measured, never decremented.** `ai_runs` already records the real
 * input and output tokens of every call (lib/ai/run.ts), so the balance is a
 * SUM over rows in the current cycle — the same "count what exists" rule that
 * keeps the analyses cap refund-free (lib/auth.ts). A run that dies half-way
 * costs exactly the tokens it burned, and a crash between two writes cannot
 * drift a balance that isn't stored.
 *
 * The estimates below are therefore ESTIMATES, and the UI says "about". They
 * exist for one job: the pre-flight check. We refuse a run we cannot afford to
 * finish rather than stopping half-way through and charging for the half — so
 * we need a number before the run, and the only honest one is a typical past
 * run's cost.
 */

/** One stage's typical draw, measured across runs. Sums to RUN_ESTIMATE. */
export interface TokenStage {
  stage: string;
  estimate: number;
}

export const TOKEN_STAGES: TokenStage[] = [
  { stage: "Reading the posting", estimate: 3_600 },
  { stage: "Matching against your profile", estimate: 4_800 },
  { stage: "Rewriting your résumé", estimate: 8_400 },
  { stage: "Preparing questions and courses", estimate: 3_200 },
];

/** A full four-stage analysis, at the default template cap. */
export const RUN_ESTIMATE = TOKEN_STAGES.reduce((sum, s) => sum + s.estimate, 0);

/**
 * The pipeline's own hard per-run ceiling (F24, GR-5), enforced by a
 * `TokenAccumulator` (lib/domain/guardrails.ts) between tailoring calls —
 * the same class the learning engine already uses for its own stage (there,
 * 15,000; here, four times the surface, so four times the ceiling). One
 * long profile times one corrective retry on every bullet has no bound
 * today; past this line, remaining bullets go out verbatim and the stage
 * says so, rather than the run quietly spending whatever it takes.
 */
export const ANALYSIS_TOKEN_CEILING = 60_000;

/** One worked answer. Frameworks are free — they cost no model call at all. */
export const DRAFT_ESTIMATE = 1_600;

/** What the member is spending on. Named so a refusal can say which. */
export type SpendKind = "analysis" | "answer";

export const SPEND: Record<SpendKind, { estimate: number; label: string; noun: string }> = {
  analysis: { estimate: RUN_ESTIMATE, label: "this analysis", noun: "This run" },
  answer: { estimate: DRAFT_ESTIMATE, label: "a full answer draft", noun: "A drafted answer" },
};

export interface TokenLedger {
  /** The cycle allowance from the member's plan, as set on `users.cap_tokens`. */
  allowance: number;
  /** One-off tokens bought or granted. Roll over; never reset by the cycle. */
  topups: number;
  /** Measured from `ai_runs` over the current cycle. */
  used: number;
}

export interface TokenBalance extends TokenLedger {
  /** allowance + topups. What the "of N" in the header refers to. */
  total: number;
  /** Never below zero: an overrun is a debt we do not collect, not a negative. */
  left: number;
  /** 0–1, for the ring. */
  fraction: number;
  /** Whole runs still affordable at the current estimate. */
  runsLeft: number;
  /** Fewer than two runs left. The header pill goes accent, once. */
  low: boolean;
  /** Not even one run. The wall opens on the next attempt. */
  empty: boolean;
}

export function tokenBalance(ledger: TokenLedger): TokenBalance {
  const total = Math.max(0, ledger.allowance + ledger.topups);
  const left = Math.max(0, total - ledger.used);
  return {
    ...ledger,
    total,
    left,
    fraction: total === 0 ? 0 : Math.min(1, left / total),
    runsLeft: Math.floor(left / RUN_ESTIMATE),
    low: left < RUN_ESTIMATE * 2,
    empty: left < RUN_ESTIMATE,
  };
}

/** What this spend would leave us short by. 0 when it fits. */
export function shortfall(balance: TokenBalance, kind: SpendKind): number {
  return Math.max(0, SPEND[kind].estimate - balance.left);
}

/**
 * "762K", "1.2M", "800". The header pill and the plan cards; anywhere the
 * number is a size rather than an amount.
 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
}

/**
 * "762,000". Used wherever the exact figure matters — the wall, the ledger, any
 * sentence a member might reasonably check our arithmetic on.
 *
 * Thousands grouping, not the Indian lakh grouping the prices use. A token
 * count is a quantity, not money: "8,00,000 tokens" beside "800K" in the header
 * reads as two different numbers, and the header abbreviation is the one people
 * see every day.
 */
export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/* ------------------------------------------------------------------- wall */

/** One exit out of the wall that costs money. Rendered as a card. */
export interface TokenWallOffer {
  id: string;
  name: string;
  price: string;
  tokens: number;
  note: string;
}

/**
 * Everything the blocked dialog needs, computed on the server (F19).
 *
 * A refusal that says "quota exceeded" is the failure F15 exists to remove, and
 * this is the same rule one level up: the member is told which meter, by how
 * much, against what allowance, when it refills, and every way out — including
 * the free one, listed first.
 *
 * Deliberately a value, not a component's props: the same object is what the
 * action returns, so there is no second place where a wall could be assembled
 * differently and disagree with the enforcement that raised it.
 */
export interface TokenWall {
  kind: SpendKind;
  /** What we expect the refused work to cost. */
  estimate: number;
  /** estimate − left. Always > 0 when a wall is raised. */
  shortfall: number;
  balance: TokenBalance;
  planName: string;
  /** Per-stage estimates, so "where the 20,000 would go" is itemised. */
  stages: TokenStage[];
  resetDate: string;
  resetIn: string;
  /**
   * An analysis can be filed against the wall — the posting is already stored.
   * An answer draft cannot: the question is already on the screen and will
   * still be there, so a queue for it would be a queue of one click.
   */
  canQueue: boolean;
  /** null on the top plan. */
  upgrade: TokenWallOffer | null;
  /** Empty on Free — see `TOPUPS` in lib/content/pricing.ts. */
  topups: TokenWallOffer[];
}

/** "26 Aug". The date a refusal names, so nobody has to count 30 days. */
export function formatResetDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "in 16 days", "tomorrow", "today". */
export function formatResetIn(date: Date, now: Date = new Date()): string {
  const days = Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

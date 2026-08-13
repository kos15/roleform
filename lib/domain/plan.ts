/**
 * S5.5 — the time-budgeted plan. PURE, and solved in application code.
 *
 * RLE spec §10: the user says "6 hours before Thursday", and we solve a bounded
 * knapsack over the selected resources — maximise Σ severity, subject to
 * Σ duration ≤ budget, with prerequisites ordered before the nodes that depend
 * on them.
 *
 * ── Why the LLM is told the answer rather than asked for it ─────────────────
 * An LLM doing arithmetic over durations is both more expensive and less
 * correct than a dynamic program that runs in single-digit milliseconds. The
 * synthesiser (S6) receives the solved sequence and narrates it. It never
 * schedules, never re-orders, and never drops a step — spec §2's stage contract
 * says its job is framing, not deciding, and the guardrails check that it kept
 * to it (OUT-1).
 */

import { nodeFor } from "@/lib/catalog/taxonomy";

export interface PlannableStep {
  /** Stable key for the (gap, resource) pair this step represents. */
  key: string;
  skillName: string;
  /** The gap's severity — what including this step buys. */
  severity: number;
  /** Rank within its own gap: 0 is the primary resource for that skill. */
  rankInGap: number;
  durationMin: number;
}

export interface PlannedStep extends PlannableStep {
  /** Position in the final sequence, 0-based. */
  order: number;
  /** Minutes elapsed in the plan before this step starts. */
  startsAtMin: number;
}

export interface PlanSolution {
  steps: PlannedStep[];
  /** Steps that did not fit the budget. Shown, but outside the plan. */
  deferred: PlannableStep[];
  totalMin: number;
  /** Null when the user set no budget — everything selected is in the plan. */
  budgetMin: number | null;
}

/** DP granularity. Five minutes is finer than any duration we store is accurate. */
const BUCKET_MIN = 5;

/**
 * Solve and sequence.
 *
 * With no budget this is pure ordering: nothing is dropped, because the user
 * asked for the whole plan and truncating it would be us deciding for them.
 */
export function solvePlan(steps: PlannableStep[], budgetMin: number | null): PlanSolution {
  const chosen = budgetMin === null ? steps : knapsack(steps, budgetMin);
  const chosenKeys = new Set(chosen.map((s) => s.key));
  const deferred = steps.filter((s) => !chosenKeys.has(s.key));

  const ordered = sequence(chosen);

  let elapsed = 0;
  const withTiming = ordered.map((step, i) => {
    const startsAtMin = elapsed;
    elapsed += step.durationMin;
    return { ...step, order: i, startsAtMin };
  });

  return { steps: withTiming, deferred, totalMin: elapsed, budgetMin };
}

/* ------------------------------------------------------------------ knapsack */

/**
 * 0/1 knapsack over five-minute buckets.
 *
 * Value is the severity the step buys, discounted by its rank inside its own
 * gap: the second resource for a skill is worth materially less than the first,
 * because most of what it teaches the first already taught. Without that
 * discount the solver happily spends a whole budget on three videos about one
 * skill, which is a worse plan than one video about three skills.
 */
function knapsack(steps: PlannableStep[], budgetMin: number): PlannableStep[] {
  const capacity = Math.max(0, Math.floor(budgetMin / BUCKET_MIN));
  if (capacity === 0) return [];

  const items = steps.map((step) => ({
    step,
    cost: Math.max(1, Math.ceil(step.durationMin / BUCKET_MIN)),
    value: step.severity * Math.pow(0.45, step.rankInGap),
  }));

  // best[c] = the highest value achievable in exactly ≤ c buckets.
  const best = new Array<number>(capacity + 1).fill(0);
  const taken: Array<Set<number>> = Array.from({ length: capacity + 1 }, () => new Set<number>());

  for (const [index, item] of items.entries()) {
    for (let c = capacity; c >= item.cost; c--) {
      const candidate = best[c - item.cost] + item.value;
      if (candidate > best[c]) {
        best[c] = candidate;
        taken[c] = new Set(taken[c - item.cost]).add(index);
      }
    }
  }

  return [...taken[capacity]].sort((a, b) => a - b).map((i) => items[i].step);
}

/* ------------------------------------------------------------------ ordering */

/**
 * Prerequisites first, then severity.
 *
 * The dependency is read off the taxonomy: if one step's skill is an ancestor
 * of another's, it is scheduled first, because studying Next.js before React is
 * a wasted evening. Within a skill the primary resource leads. Everything else
 * falls back to severity, so the biggest thing you can fix comes first.
 *
 * This is a stable insertion sort rather than a topological sort on purpose:
 * the taxonomy is a forest with no cycles (`assertTaxonomy` enforces it), so the
 * ancestor relation is already a partial order, and a comparator that respects
 * it plus a stable sort gives the same answer with far less machinery.
 */
function sequence(steps: PlannableStep[]): PlannableStep[] {
  return [...steps].sort((a, b) => {
    if (a.skillName !== b.skillName) {
      const relation = ancestry(a.skillName, b.skillName);
      if (relation !== 0) return relation;
    }
    if (a.severity !== b.severity) return b.severity - a.severity;
    if (a.rankInGap !== b.rankInGap) return a.rankInGap - b.rankInGap;
    return a.key.localeCompare(b.key);
  });
}

/** -1 when `a` is a prerequisite of `b`, 1 when the reverse, 0 when unrelated. */
function ancestry(a: string, b: string): number {
  const nodeA = nodeFor(a);
  const nodeB = nodeFor(b);
  if (!nodeA || !nodeB) return 0;
  if (nodeB.path.includes(a)) return -1;
  if (nodeA.path.includes(b)) return 1;
  return 0;
}

/* -------------------------------------------------------------------- format */

/** "1h 45m" / "45m". Rendered in the UI and handed to S6 as a fact, not a sum. */
export function formatMinutes(min: number): string {
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

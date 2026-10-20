/**
 * The checker contract (agent design §6.3). Types only.
 *
 * A checker is a second model — Jev — asked a narrow, typed question about a
 * writer's output. It never replaces the deterministic guard in
 * lib/domain/fabrication.ts; it runs after it.
 */

/** Mirrors lib/domain/fabrication.ts `FabricationKind`, plus the two it cannot detect by pattern. */
export type CheckKind = "metric" | "tool" | "seniority" | "scale" | "merged_role" | "date" | "none";

export interface CheckVerdict {
  /** p ≥ the checker's threshold. */
  flagged: boolean;
  /** The model's probability that the output overstates its evidence. */
  p: number;
  kind: CheckKind;
  /** The checker did not run (switched off, no key, timeout, error). Fails open. */
  skipped: boolean;
}

export interface Checker<I, O> {
  name: string;
  check(input: I, output: O, ctx: { clerkUserId: string; analysisId?: string }): Promise<CheckVerdict>;
}

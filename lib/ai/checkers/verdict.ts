/**
 * Checker verdicts. PURE.
 *
 * A verdict is a threshold over Jev's calibrated probability. The correction
 * sent back to a writer is one of a fixed set of sentences keyed by kind —
 * never text a model produced, so nothing a checker reads can be smuggled
 * into the writer's next prompt.
 */
import type { CheckKind, CheckVerdict } from "./types";

export const CHECK_KINDS: readonly CheckKind[] = ["metric", "tool", "seniority", "scale", "merged_role", "date", "none"];

/**
 * Starting thresholds (agent design §6.3). Set from the eval's honest and
 * adversarial sets at the gate (agent plan Task 8), never tuned by feel.
 */
export const THRESHOLDS = {
  fabrication: 0.5,
  answerClaims: 0.5,
  injection: 0.5,
} as const;

export function verdictFrom(p: number, kind: CheckKind, threshold: number): CheckVerdict {
  return { flagged: p >= threshold, p, kind, skipped: false };
}

/** The checker did not run. Fails open to the deterministic guard's verdict. */
export const SKIPPED: CheckVerdict = { flagged: false, p: 0, kind: "none", skipped: true };

const CORRECTIONS: Record<CheckKind, string> = {
  metric: "The rewrite states a number the source does not. Use only numbers the source bullet states.",
  tool: "The rewrite names a tool or technology the source does not mention. Use only tools the member's profile states.",
  seniority: "The rewrite raises the member's title, ownership or seniority. Keep the role exactly as the source states it.",
  scale: "The rewrite claims a size, reach or impact the source does not state. Remove the magnitude claim.",
  merged_role: "The rewrite combines work from different roles or projects. Keep to what this one source states.",
  date: "The rewrite changes or extends a date or duration. Keep dates exactly as the source states them.",
  none: "The rewrite claims more than its source supports. Say only what the source states, in the posting's words.",
};

export function correctionFor(v: CheckVerdict): string {
  return CORRECTIONS[v.kind];
}

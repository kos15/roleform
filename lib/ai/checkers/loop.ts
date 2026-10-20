/**
 * The bounded check-and-revise step (agent design §6.3). PURE.
 *
 * Two budgets, never shared: `retries` pays for schema, output-guard and
 * deterministic-verify failures (today's corrective retry); `checkerRetries`
 * pays for one rewrite the Jev checker asked for. Sharing them would mean a
 * bullet that spent its retry on the regex guard never gets a checked rewrite.
 */
import type { CheckVerdict } from "./types";

export type CheckDecision = "accept" | "revise" | "fallback";

export function decideAfterCheck(args: { verdict: CheckVerdict; checkerRetriesLeft: number }): CheckDecision {
  if (args.verdict.skipped || !args.verdict.flagged) return "accept";
  return args.checkerRetriesLeft > 0 ? "revise" : "fallback";
}

export function budgetsAfterGuardRetry(b: { retries: number; checkerRetries: number }): {
  retries: number;
  checkerRetries: number;
} {
  return { retries: b.retries - 1, checkerRetries: b.checkerRetries };
}

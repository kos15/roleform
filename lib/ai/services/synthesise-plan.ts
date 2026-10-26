import "server-only";
import { runAgent } from "../agents/define";
import { learningPlanner, type SynthesisGap } from "../agents/learning-planner";
import type { LearningPlanOut } from "../schemas/learning-plan";
import type { Result } from "@/lib/domain/types";

export type { SynthesisGap };

/**
 * S6 — the plan synthesiser. Exactly one large-model call per run (agent.md I5,
 * N12). The contract, the prompt and the verify pass live in
 * lib/ai/agents/learning-planner.ts.
 *
 * ── What this call does NOT receive ─────────────────────────────────────────
 * No chunk text. No transcripts. No URLs. No full résumé. No taxonomy. The
 * synthesiser's job is sequencing and framing, not summarising.
 */
export async function synthesisePlan(args: {
  clerkUserId: string;
  analysisId: string;
  jobTitle: string;
  matchedStrengths: string[];
  budgetMin: number | null;
  gaps: SynthesisGap[];
}): Promise<Result<{ plan: LearningPlanOut; aiRunId: string }>> {
  const outcome = await runAgent(
    learningPlanner,
    { jobTitle: args.jobTitle, matchedStrengths: args.matchedStrengths, budgetMin: args.budgetMin, gaps: args.gaps },
    { clerkUserId: args.clerkUserId, analysisId: args.analysisId },
  );
  if (!outcome.ok) return outcome;
  return { ok: true, value: { plan: outcome.value.value, aiRunId: outcome.value.aiRunId } };
}

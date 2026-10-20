import "server-only";
import { jevAsk, noulOf } from "./jev";
import { answerClaimRequest } from "./requests";
import { SKIPPED, THRESHOLDS, verdictFrom } from "./verdict";
import type { Checker, CheckVerdict } from "./types";

export interface AnswerClaimInput {
  question: string;
  /** The bullets the question cites. */
  evidence: string[];
  /** The other profile bullets the writer was shown. */
  profileFacts: string[];
  /** A gap question coaches honest positioning (CLAUDE.md §3), never a credential. */
  isGap: boolean;
}

/** AnswerClaimChecker — does a worked answer script a claim the member cannot make? */
export async function checkAnswerClaims(
  input: AnswerClaimInput,
  output: { text: string },
  ctx: { clerkUserId: string; analysisId?: string },
): Promise<CheckVerdict> {
  const { model: _model, ...request } = answerClaimRequest(input, output, "");
  const response = await jevAsk({ purpose: "check_answer_claims", request, ...ctx });
  if (!response) return SKIPPED;
  const p = noulOf(response, "scripts_claim");
  if (p === null) return SKIPPED;
  return verdictFrom(p, "answer_claim", THRESHOLDS.answerClaims);
}

export const answerClaimChecker: Checker<AnswerClaimInput, { text: string }> = {
  name: "check_answer_claims",
  check: checkAnswerClaims,
};

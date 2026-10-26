import "server-only";
import { choiceOf, jevAsk, noulOf } from "./jev";
import { fabricationRequest } from "./requests";
import { CHECK_KINDS, SKIPPED, THRESHOLDS, verdictFrom } from "./verdict";
import type { CheckKind, Checker, CheckVerdict } from "./types";

export interface FabricationCheckInput {
  /** The member's own words the rewrite came from. */
  source: string;
  /** Every tool the profile states anywhere — what the writer was allowed to use. */
  profileTerms: string[];
  /** The posting's requirement texts, so the checker sees what tempted the rewrite. */
  postingTerms: string[];
}

/**
 * FabricationChecker — does a tailored bullet or summary claim more than its
 * source? Runs after `lib/domain/fabrication.ts`, which catches what a pattern
 * can (numbers, scale words, camel-cased tools); this catches what it cannot
 * — a plain-word tool (Tableau, Snowflake), an inflated title, a merged role.
 */
export async function checkFabrication(
  input: FabricationCheckInput,
  output: { text: string },
  ctx: { clerkUserId: string; analysisId?: string },
): Promise<CheckVerdict> {
  const { model: _model, ...request } = fabricationRequest(input, output, "");
  const response = await jevAsk({ purpose: "check_fabrication", request, ...ctx });
  if (!response) return SKIPPED;
  const p = noulOf(response, "invents");
  if (p === null) return SKIPPED;
  const choice = choiceOf(response, "kind");
  const kind: CheckKind = (CHECK_KINDS as readonly string[]).includes(choice ?? "") ? (choice as CheckKind) : "none";
  return verdictFrom(p, kind, THRESHOLDS.fabrication);
}

export const fabricationChecker: Checker<FabricationCheckInput, { text: string }> = {
  name: "check_fabrication",
  check: checkFabrication,
};

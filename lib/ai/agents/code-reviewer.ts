import "server-only";
import { CodeReviewSchema } from "../schemas/drill";
import { PROMPT_VERSIONS, SYSTEM } from "../system-prompts";
import { type CaseResult, type CodeLanguage, type Signature } from "@/lib/domain/drill";
import { defineAgent } from "./define";
import * as prompt from "../prompts/code-reviewer";

export interface CodeReviewerInput {
  problem: { title: string; statement: string; signature: Signature; optimalTime: string; optimalSpace: string };
  language: CodeLanguage;
  code: string;
  tests: { passed: number; total: number; failing: CaseResult[] } | null;
  secondsUsed: number;
  minutes: number;
}

/** CodeReviewer — reads a submitted solution; the tests overrule it (F26). */
export const codeReviewer = defineAgent({
  name: "code_review",
  promptVersion: PROMPT_VERSIONS.codeReview,
  model: "writer-fast",
  schema: CodeReviewSchema,
  system: SYSTEM.codeReview,
  staticContext: prompt.staticContext,
  dynamicContext: prompt.dynamicContext,
  reasoningEffort: "minimal",
  maxOutputTokens: 3_300,
  retries: 1,
  // The member's own code: scanned for injected instructions, never redacted —
  // pii patterns would rewrite numeric literals and change the code reviewed.
  inputGuards: ["injection_regex"],
  outputGuards: ["no_urls", "tone_prep"],
});

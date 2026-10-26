import "server-only";
import { CodeReviewSchema } from "../schemas/drill";
import { PROMPT_VERSIONS, SYSTEM } from "../system-prompts";
import { LANGUAGE_LABEL, type CaseResult, type CodeLanguage, type Signature } from "@/lib/domain/drill";
import { defineAgent } from "./define";

export interface CodeReviewerInput {
  problem: { title: string; statement: string; signature: Signature; optimalTime: string; optimalSpace: string };
  language: CodeLanguage;
  code: string;
  tests: { passed: number; total: number; failing: CaseResult[] } | null;
  secondsUsed: number;
  minutes: number;
}

function testLine(t: CodeReviewerInput["tests"]): string {
  if (!t) return "Not executed (no runtime for this language) — trace the examples.";
  return (
    `Executed: ${t.passed} of ${t.total} tests passed.` +
    (t.failing.length
      ? ` Failing: ${t.failing
          .slice(0, 2)
          .map((f) => `input ${f.input} → got ${f.actual}, expected ${f.expected}`)
          .join("; ")}`
      : "")
  );
}

/** CodeReviewer — reads a submitted solution; the tests overrule it (F26). */
export const codeReviewer = defineAgent({
  name: "code_review",
  promptVersion: PROMPT_VERSIONS.codeReview,
  model: "writer-fast",
  schema: CodeReviewSchema,
  system: SYSTEM.codeReview,
  staticContext: (i: CodeReviewerInput) =>
    [
      `<problem title="${i.problem.title.replace(/"/g, "'")}">`,
      i.problem.statement.slice(0, 1_500),
      `</problem>`,
      `Optimal: time ${i.problem.optimalTime}, space ${i.problem.optimalSpace}.`,
    ].join("\n"),
  dynamicContext: (i) =>
    [
      `Language: ${LANGUAGE_LABEL[i.language]}. Time used: ${Math.round(i.secondsUsed / 60)} of ${i.minutes} minutes.`,
      testLine(i.tests),
      `<candidate_code>`,
      i.code,
      `</candidate_code>`,
    ].join("\n"),
  reasoningEffort: "minimal",
  maxOutputTokens: 3_300,
  retries: 1,
  // The member's own code: scanned for injected instructions, never redacted —
  // pii patterns would rewrite numeric literals and change the code reviewed.
  inputGuards: ["injection_regex"],
  outputGuards: ["no_urls", "tone_prep"],
});

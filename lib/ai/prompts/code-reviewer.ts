import type { CodeReviewerInput } from "../agents/code-reviewer";
import { LANGUAGE_LABEL } from "@/lib/domain/drill";

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

export function staticContext(i: CodeReviewerInput): string {
  return [
    `<problem title="${i.problem.title.replace(/"/g, "'")}">`,
    i.problem.statement.slice(0, 1_500),
    `</problem>`,
    `Optimal: time ${i.problem.optimalTime}, space ${i.problem.optimalSpace}.`,
  ].join("\n");
}

export function dynamicContext(i: CodeReviewerInput): string {
  return [
    `Language: ${LANGUAGE_LABEL[i.language]}. Time used: ${Math.round(i.secondsUsed / 60)} of ${i.minutes} minutes.`,
    testLine(i.tests),
    `<candidate_code>`,
    i.code,
    `</candidate_code>`,
  ].join("\n");
}

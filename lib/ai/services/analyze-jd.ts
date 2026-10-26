import "server-only";
import { runAgent } from "../agents/define";
import { postingReader } from "../agents/posting-reader";
import type { JdAnalysis } from "../schemas/jd-analysis";
import { JD_MAX_CHARS } from "@/lib/domain/guardrails";
import { stripBoilerplate } from "@/lib/domain/jd-segment";
import type { Result } from "@/lib/domain/types";

export async function analyzeJd(args: {
  clerkUserId: string;
  analysisId: string;
  rawText: string;
}): Promise<Result<{ analysis: JdAnalysis; truncated: boolean; aiRunId: string }>> {
  // PR-5: boilerplate stripped before the ceiling is applied, so a posting
  // with a long benefits section gets more of its ACTUAL content inside the
  // window rather than losing it to truncation.
  const stripped = stripBoilerplate(args.rawText);
  const truncated = stripped.text.length > JD_MAX_CHARS;
  const text = truncated ? stripped.text.slice(0, JD_MAX_CHARS) : stripped.text;

  const outcome = await runAgent(postingReader, { text }, {
    clerkUserId: args.clerkUserId,
    analysisId: args.analysisId,
  });

  if (!outcome.ok) return outcome;
  return {
    ok: true,
    value: { analysis: outcome.value.value, truncated, aiRunId: outcome.value.aiRunId },
  };
}


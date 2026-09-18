import "server-only";
import { runStructured } from "./run";
import { JdAnalysisSchema, type JdAnalysis } from "./schemas/jd-analysis";
import { PROMPT_VERSIONS, SYSTEM } from "./prompts";
import { TEMPERATURE } from "./models";
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

  const outcome = await runStructured({
    purpose: "analyze_jd",
    promptVersion: PROMPT_VERSIONS.analyzeJd,
    tier: "mid",
    schema: JdAnalysisSchema,
    system: SYSTEM.analyzeJd,
    prompt: `Extract the requirements from this posting.\n\n<posting>\n${text}\n</posting>`,
    temperature: TEMPERATURE.analysis,
    clerkUserId: args.clerkUserId,
    analysisId: args.analysisId,
    maxOutputTokens: 3_000,
    // COST-3: one corrective retry per stage, not two — the worst case used
    // to be three full passes over the largest input in the run for the one
    // stage the retry rarely fixes (the failure is almost always a bad quote,
    // and the correction message already tells the model exactly which).
    retries: 1,
    verify: (value) => {
      // An evidenceQuote that isn't in the posting is a fabricated requirement.
      const haystack = normalise(text);
      const invented = value.requirements.filter(
        (r) => !haystack.includes(normalise(r.evidenceQuote).slice(0, 40)),
      );
      if (invented.length > 0) {
        return `${invented.length} requirement(s) carry an evidenceQuote that does not appear in the posting. Quote the posting verbatim.`;
      }
      return null;
    },
  });

  if (!outcome.ok) return outcome;
  return {
    ok: true,
    value: { analysis: outcome.value.value, truncated, aiRunId: outcome.value.aiRunId },
  };
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

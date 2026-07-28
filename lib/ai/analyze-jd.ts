import "server-only";
import { runStructured } from "./run";
import { JdAnalysisSchema, type JdAnalysis } from "./schemas/jd-analysis";
import { PROMPT_VERSIONS, SYSTEM } from "./prompts";
import { TEMPERATURE } from "./models";
import type { Result } from "@/lib/domain/types";

/** Postings run long; requirements live in the top two-thirds (specs §13). */
const MAX_CHARS = 24_000;

export async function analyzeJd(args: {
  clerkUserId: string;
  analysisId: string;
  rawText: string;
}): Promise<Result<{ analysis: JdAnalysis; truncated: boolean; aiRunId: string }>> {
  const truncated = args.rawText.length > MAX_CHARS;
  const text = truncated ? args.rawText.slice(0, MAX_CHARS) : args.rawText;

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
    retries: 2,
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

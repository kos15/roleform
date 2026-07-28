import "server-only";
import { runStructured } from "./run";
import { ExtractProfileSchema, type ExtractProfileResult } from "./schemas/resume-json";
import { PROMPT_VERSIONS, SYSTEM } from "./prompts";
import { TEMPERATURE } from "./models";
import type { Result } from "@/lib/domain/types";

/**
 * Raw text → structured profile (F1).
 *
 * No regex section detection. The LLM structures from raw text, which is far
 * more robust to two-column layouts than any heading heuristic we could write.
 *
 * The output is a DRAFT. Nothing reaches master_profiles or experience_bullets
 * without the user confirming it on the review screen (N3).
 */
export async function extractProfile(args: {
  clerkUserId: string;
  rawText: string;
}): Promise<Result<{ result: ExtractProfileResult; aiRunId: string }>> {
  const outcome = await runStructured({
    purpose: "extract_profile",
    promptVersion: PROMPT_VERSIONS.extractProfile,
    tier: "strong",
    schema: ExtractProfileSchema,
    system: SYSTEM.extractProfile,
    prompt: `Transcribe this résumé.\n\n<resume_text>\n${args.rawText}\n</resume_text>`,
    temperature: TEMPERATURE.extraction,
    clerkUserId: args.clerkUserId,
    retries: 2,
    verify: (value) => {
      const total = value.resume.work.reduce((n, w) => n + w.highlights.length, 0);
      if (value.resume.work.length > 0 && total === 0) {
        return "Every role came back with zero highlights. Transcribe the bullets under each employer.";
      }
      return null;
    },
  });

  if (!outcome.ok) return outcome;
  return { ok: true, value: { result: outcome.value.value, aiRunId: outcome.value.aiRunId } };
}

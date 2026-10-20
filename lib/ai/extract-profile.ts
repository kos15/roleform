import "server-only";
import { runAgent } from "./agents/define";
import { profileReader } from "./agents/profile-reader";
import type { ExtractProfileResult } from "./schemas/resume-json";
import { clampForModel, cleanExtractedText } from "@/lib/extract/normalise";
import { normaliseDraft } from "@/lib/domain/profile-draft";
import { err, appError, type ModelFailure, type Result } from "@/lib/domain/types";

/**
 * Raw text → structured profile (F1).
 *
 * No regex section detection. The LLM structures from raw text, which is far
 * more robust to two-column layouts than any heading heuristic we could write.
 *
 * The output is a DRAFT. Nothing reaches master_profiles or experience_bullets
 * without the user confirming it on the review screen (N3).
 *
 * ── Attempts (PR-4 exception, written reason) ───────────────────────────────
 * Up to EXTRACT_ATTEMPTS calls, each driven by the client so the user sees
 * "attempt 2 of 3" instead of a spinner that just takes longer. Extraction is
 * the one stage that runs once per user, gates everything after it, and is
 * amortised over every later analysis; a failed extraction is a user who never
 * reaches the product. Each attempt runs with retries: 0, so the attempt count
 * on screen is the call count billed — nothing hidden behind it.
 *
 * A later attempt is not a blind repeat. It is told why the previous one
 * failed, and an attempt after a truncation gets a larger ceiling — re-running
 * a cut-off response at the same ceiling fails the same way.
 */
export const EXTRACT_ATTEMPTS = 3;

const CORRECTION: Partial<Record<ModelFailure, string>> = {
  truncated:
    "Your previous attempt ran out of room. Copy text verbatim but add nothing else: no commentary, \"\" for unknown fields, [] for absent sections.",
  schema:
    "Your previous attempt did not match the schema. Every field is required: use \"\" for unknown text, null for unknown dates, [] for absent sections.",
  verify: "Your previous attempt returned roles with no bullets. Transcribe every bullet under each employer.",
};


export async function extractProfile(args: {
  clerkUserId: string;
  rawText: string;
  attempt: number;
  previousFailure: ModelFailure | null;
  readFromImage: boolean;
}): Promise<Result<{ result: ExtractProfileResult; aiRunId: string }>> {
  const { text, clipped } = clampForModel(cleanExtractedText(args.rawText));
  if (text.length < 40) {
    return err(appError("extraction_failed", "There isn't enough readable text in that document to build a profile."));
  }

  const correction = args.previousFailure ? CORRECTION[args.previousFailure] : undefined;

  const outcome = await runAgent(
    profileReader,
    { text, previousFailure: args.previousFailure, correction },
    { clerkUserId: args.clerkUserId },
  );

  if (!outcome.ok) return outcome;

  const { resume, notices } = normaliseDraft(outcome.value.value);
  return {
    ok: true,
    value: {
      result: { resume, notices: { ...notices, readFromImage: args.readFromImage, clipped } },
      aiRunId: outcome.value.aiRunId,
    },
  };
}

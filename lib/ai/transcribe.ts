import "server-only";
import { runStructured } from "./run";
import { TranscriptionSchema } from "./schemas/resume-json";
import { PROMPT_VERSIONS, SYSTEM } from "./prompts";
import { TEMPERATURE } from "./models";
import { cleanExtractedText } from "@/lib/extract/normalise";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/**
 * Scan or photo → text (F1). The vision pass for documents with no text layer:
 * image uploads, and PDFs that are pictures of pages.
 *
 * It only transcribes. Structuring stays in extract-profile.ts, so a retry of
 * the structuring step never pays for the image twice — the text is stored on
 * the source document after this succeeds.
 *
 * The bytes go to the model provider for this one call and nowhere else; no
 * part of the image or its text is logged (N7).
 */
export async function transcribeDocument(args: {
  clerkUserId: string;
  data: Uint8Array;
  mediaType: string;
  filename: string;
}): Promise<Result<{ text: string; aiRunId: string }>> {
  const outcome = await runStructured({
    purpose: "transcribe_document",
    promptVersion: PROMPT_VERSIONS.transcribeDocument,
    tier: "strong",
    schema: TranscriptionSchema,
    system: SYSTEM.transcribeDocument,
    prompt: "Transcribe the attached document.",
    files: [{ data: args.data, mediaType: args.mediaType, filename: args.filename }],
    temperature: TEMPERATURE.extraction,
    clerkUserId: args.clerkUserId,
    // A dense two-page CV is ~2,500 words.
    maxOutputTokens: 6_000,
    timeoutMs: 150_000,
    retries: 1,
  });
  if (!outcome.ok) return outcome;

  const text = cleanExtractedText(outcome.value.value.text);
  if (text.length < 40) {
    return err(
      appError(
        "no_text_layer",
        "We couldn't make out the text in that image. Try a sharper photo or scan, or paste the text instead.",
      ),
    );
  }
  return ok({ text, aiRunId: outcome.value.aiRunId });
}

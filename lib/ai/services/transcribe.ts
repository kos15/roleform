import "server-only";
import { runAgent } from "../agents/define";
import { documentTranscriber } from "../agents/document-transcriber";
import { cleanExtractedText } from "@/lib/services/extract/normalise";
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
  const outcome = await runAgent(
    documentTranscriber,
    { data: args.data, mediaType: args.mediaType, filename: args.filename },
    { clerkUserId: args.clerkUserId },
  );
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

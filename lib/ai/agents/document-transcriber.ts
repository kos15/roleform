import "server-only";
import { TranscriptionSchema } from "../schemas/resume-json";
import { PROMPT_VERSIONS, SYSTEM } from "../prompts";
import { defineAgent } from "./define";

export interface DocumentTranscriberInput {
  data: Uint8Array;
  mediaType: string;
  filename: string;
}

/**
 * DocumentTranscriber — a scan or photo → plain text (F1). Only transcribes;
 * structuring is ProfileReader's job. The bytes go to the provider for this
 * one call and nowhere else (N7).
 */
export const documentTranscriber = defineAgent({
  name: "transcribe_document",
  promptVersion: PROMPT_VERSIONS.transcribeDocument,
  model: "writer",
  schema: TranscriptionSchema,
  system: SYSTEM.transcribeDocument,
  dynamicContext: (_: DocumentTranscriberInput) => "Transcribe the attached document.",
  files: (i) => [{ data: i.data, mediaType: i.mediaType, filename: i.filename }],
  reasoningEffort: "medium",
  // A dense two-page CV is ~2,500 words; doubled for reasoning tokens.
  maxOutputTokens: 12_000,
  timeoutMs: 150_000,
  retries: 1,
  inputGuards: [],
  outputGuards: [],
});

import type { DocumentTranscriberInput } from "../agents/document-transcriber";

export function dynamicContext(_: DocumentTranscriberInput): string {
  return "Transcribe the attached document.";
}

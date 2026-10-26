import type { ProfileReaderInput } from "../agents/profile-reader";

export function staticContext(): string {
  return "Transcribe this résumé.";
}

export function dynamicContext(i: ProfileReaderInput): string {
  return [`<resume_text>`, i.text, `</resume_text>`, ...(i.correction ? [``, `## Correction required`, i.correction] : [])].join(
    "\n",
  );
}

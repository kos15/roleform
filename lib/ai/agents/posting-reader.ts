import "server-only";
import { JdAnalysisSchema } from "../schemas/jd-analysis";
import { PROMPT_VERSIONS, SYSTEM } from "../prompts";
import { defineAgent } from "./define";

export interface PostingReaderInput {
  /** Boilerplate-stripped, already within JD_MAX_CHARS. */
  text: string;
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * PostingReader — a job posting → its requirements, each with a verbatim
 * evidence quote (F2). No `pii` guard: `verify` checks every quote against the
 * exact text the model saw, and redacting the posting would make honest quotes
 * fail. Postings are third-party content, so they get both injection checks.
 */
export const postingReader = defineAgent({
  name: "analyze_jd",
  promptVersion: PROMPT_VERSIONS.analyzeJd,
  model: "writer-fast",
  schema: JdAnalysisSchema,
  system: SYSTEM.analyzeJd,
  staticContext: () => "Extract the requirements from this posting.",
  dynamicContext: (i: PostingReaderInput) => `<posting>\n${i.text}\n</posting>`,
  reasoningEffort: "low",
  maxOutputTokens: 6_000,
  // COST-3: one corrective retry per stage, not two.
  retries: 1,
  // No "size": analyzeJd already cuts the posting to JD_MAX_CHARS before wrapping it,
  // and truncating the wrapped text could cut off the closing tag.
  inputGuards: ["injection_regex", "injection_jev", "protected"],
  documentKind: "posting",
  outputGuards: [],
  verify: (value, i) => {
    // An evidenceQuote that isn't in the posting is a fabricated requirement.
    const haystack = normalise(i.text);
    const invented = value.requirements.filter((r) => !haystack.includes(normalise(r.evidenceQuote).slice(0, 40)));
    if (invented.length > 0) {
      return `${invented.length} requirement(s) carry an evidenceQuote that does not appear in the posting. Quote the posting verbatim.`;
    }
    return null;
  },
});

import "server-only";
import { TailorSummarySchema } from "../schemas/tailored-bullets";
import { PROMPT_VERSIONS, SYSTEM } from "../system-prompts";
import { checkFabrication } from "@/lib/domain/fabrication";
import { defineAgent } from "./define";
import { checkFabrication as checkWithJev } from "../typesafe/fabrication";

export interface SummaryTailorInput {
  jobTitle: string;
  /** The bullets already on the résumé, as tailored. The summary's only source. */
  bullets: string[];
  profileTerms: string[];
}

/** SummaryTailor — the résumé's summary line and paragraph, from its own bullets (F5). */
export const summaryTailor = defineAgent({
  name: "tailor_summary",
  promptVersion: PROMPT_VERSIONS.tailorSummary,
  model: "writer-fast",
  schema: TailorSummarySchema,
  system: SYSTEM.tailorSummary,
  staticContext: (i: SummaryTailorInput) => `Role: ${i.jobTitle}`,
  dynamicContext: (i) => `Bullets already on the résumé:\n${i.bullets.map((b) => `- ${b}`).join("\n")}`,
  reasoningEffort: "low",
  maxOutputTokens: 2_400,
  // Falls back to the stock line on timeout, so waiting longer buys nothing.
  timeoutMs: 45_000,
  retries: 1,
  inputGuards: ["pii"],
  outputGuards: ["no_urls", "tone"],
  verify: (value, i) => {
    const findings = checkFabrication({
      source: i.bullets.join(" "),
      rewritten: value.professionalSummary,
      profileTerms: i.profileTerms,
    });
    return findings.length > 0 ? findings.map((f) => `Remove "${f.token}" — ${f.reason}.`).join(" ") : null;
  },
  checker: {
    run: (i, out, ctx) =>
      checkWithJev(
        { source: i.bullets.join("\n"), profileTerms: i.profileTerms, postingTerms: [i.jobTitle] },
        { text: `${out.summary}\n${out.professionalSummary}` },
        ctx,
      ),
    rejectMessage: "The summary overstated the bullets; the stock line is used instead.",
  },
});

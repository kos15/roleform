import "server-only";
import { QuestionAnswerSchema } from "../schemas/question-answer";
import { PROMPT_VERSIONS, SYSTEM } from "../system-prompts";
import type { DomainBullet } from "@/lib/domain/types";
import { defineAgent } from "./define";
import * as prompt from "../prompts/answer-writer";
import { checkAnswerClaims } from "../typesafe/answer-claims";

export interface AnswerWriterInput {
  jobTitle: string;
  company: string;
  seniority: string | null;
  question: { type: string; text: string; whyTheyAsk: string; frame: string[] };
  /** Bullets the question already cites — the answer may lean on these hardest. */
  evidenceBullets: DomainBullet[];
  /** The rest of the profile, already ranked and trimmed by the caller. */
  otherBullets: DomainBullet[];
  requirementText: string | null;
}

/**
 * AnswerWriter — a full worked answer for one question (F7.2). The structural
 * fabrication guard stays: only `resumeHooks` speak in the first person, and
 * every hook must cite a bullet id it was shown. Task 5 adds the Jev
 * answer-claim checker after this.
 */
export const answerWriter = defineAgent({
  name: "question_answer",
  promptVersion: PROMPT_VERSIONS.answerQuestion,
  model: "writer-fast",
  schema: QuestionAnswerSchema,
  system: SYSTEM.answerQuestion,
  staticContext: prompt.staticContext,
  dynamicContext: prompt.dynamicContext,
  reasoningEffort: "low",
  maxOutputTokens: 7_500,
  retries: 1,
  inputGuards: ["pii", "protected"],
  // GR-4: "prep" scope — a gap answer honestly naming what the candidate has
  // not done is the answer, not a deficiency claim.
  outputGuards: ["no_urls", "tone_prep"],
  verify: (value, i) => {
    const allowed = new Set([...i.evidenceBullets, ...i.otherBullets].map((b) => b.id));
    const invented = value.resumeHooks.map((h) => h.bulletId).filter((id) => !allowed.has(id));
    if (invented.length > 0) {
      return (
        `These bullet ids do not exist: ${[...new Set(invented)].join(", ")}. ` +
        `Cite only ids from <cited_bullets> or <other_profile_bullets>, or return an empty resumeHooks array.`
      );
    }
    return null;
  },
  checker: {
    run: (i, out, ctx) =>
      checkAnswerClaims(
        {
          question: i.question.text,
          evidence: i.evidenceBullets.map((b) => b.text),
          profileFacts: i.otherBullets.map((b) => b.text),
          isGap: i.question.type === "gap",
        },
        { text: [out.headline, ...out.sections.map((s) => s.body), ...out.resumeHooks.map((h) => h.useIt)].join("\n") },
        ctx,
      ),
    rejectMessage: "We couldn't draft this answer without overstating your experience. Try again.",
  },
});

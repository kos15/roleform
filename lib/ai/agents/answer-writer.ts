import "server-only";
import { QuestionAnswerSchema } from "../schemas/question-answer";
import { PROMPT_VERSIONS, SYSTEM } from "../system-prompts";
import type { DomainBullet } from "@/lib/domain/types";
import { defineAgent } from "./define";
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
  staticContext: (i: AnswerWriterInput) =>
    [`Role: ${i.jobTitle}${i.company ? ` at ${i.company}` : ""}`, i.seniority ? `Seniority stated in the posting: ${i.seniority}` : ``]
      .filter(Boolean)
      .join("\n"),
  dynamicContext: (i) =>
    [
      `<question type="${i.question.type}">`,
      i.question.text,
      `</question>`,
      ``,
      `<why_they_ask>${i.question.whyTheyAsk}</why_they_ask>`,
      ``,
      `<existing_frame>`,
      ...i.question.frame.map((f) => `- ${f}`),
      `</existing_frame>`,
      `The frame above is the scaffolding the user already sees. Your answer fills it in and goes`,
      `deeper — it does not restate it.`,
      ``,
      i.requirementText ? `<requirement_probed>${i.requirementText}</requirement_probed>` : ``,
      ``,
      `<cited_bullets>`,
      ...i.evidenceBullets.map((b) => `- id=${b.id} :: ${b.text}`),
      `</cited_bullets>`,
      ``,
      `<other_profile_bullets>`,
      ...i.otherBullets.map((b) => `- id=${b.id} :: ${b.text}`),
      `</other_profile_bullets>`,
      ``,
      i.question.type === "gap"
        ? `This question probes something the profile CANNOT evidence. Teach the subject honestly. ` +
          `resumeHooks may only name the nearest adjacent thing the candidate genuinely did, or be empty.`
        : `Every resumeHook must cite an id from the two bullet lists above. Prefer <cited_bullets>.`,
    ]
      .filter(Boolean)
      .join("\n"),
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

import "server-only";
import { runStructured } from "./run";
import { QuestionAnswerSchema, type QuestionAnswerOut } from "./schemas/question-answer";
import { PROMPT_VERSIONS, SYSTEM } from "./prompts";
import { TEMPERATURE } from "./models";
import type { DomainBullet, Result } from "@/lib/domain/types";

/**
 * A full worked answer for one question (F7.2).
 *
 * Runs on the MID tier deliberately. The expensive judgement — what this
 * candidate can actually evidence — was made upstream by the deterministic
 * coverage pass and by question generation. This step writes prose over an
 * already-decided set of facts, drafted on demand for one question at a time,
 * so the strong tier would be paying for a decision that is no longer open.
 *
 * The fabrication guard is structural, not prompted: only `resumeHooks` speak
 * in the first person, and every hook is dropped unless it cites a bullet id we
 * supplied. A model that invents a credential has nowhere to put it.
 */
export async function generateAnswer(args: {
  clerkUserId: string;
  analysisId: string;
  jobTitle: string;
  company: string;
  seniority: string | null;
  question: {
    type: string;
    text: string;
    whyTheyAsk: string;
    frame: string[];
  };
  /** Bullets the question already cites — the answer may lean on these hardest. */
  evidenceBullets: DomainBullet[];
  /** The rest of the profile, so an answer can reach for an adjacent fact. */
  otherBullets: DomainBullet[];
  requirementText: string | null;
}): Promise<Result<{ answer: QuestionAnswerOut; aiRunId: string }>> {
  const allowed = new Set([...args.evidenceBullets, ...args.otherBullets].map((b) => b.id));

  const outcome = await runStructured({
    purpose: "question_answer",
    promptVersion: PROMPT_VERSIONS.answerQuestion,
    tier: "mid",
    schema: QuestionAnswerSchema,
    system: SYSTEM.answerQuestion,
    prompt: [
      `Role: ${args.jobTitle}${args.company ? ` at ${args.company}` : ""}`,
      args.seniority ? `Seniority stated in the posting: ${args.seniority}` : ``,
      ``,
      `<question type="${args.question.type}">`,
      args.question.text,
      `</question>`,
      ``,
      `<why_they_ask>${args.question.whyTheyAsk}</why_they_ask>`,
      ``,
      `<existing_frame>`,
      ...args.question.frame.map((f) => `- ${f}`),
      `</existing_frame>`,
      `The frame above is the scaffolding the user already sees. Your answer fills it in and goes`,
      `deeper — it does not restate it.`,
      ``,
      args.requirementText ? `<requirement_probed>${args.requirementText}</requirement_probed>` : ``,
      ``,
      `<cited_bullets>`,
      ...args.evidenceBullets.map((b) => `- id=${b.id} :: ${b.text}`),
      `</cited_bullets>`,
      ``,
      `<other_profile_bullets>`,
      ...args.otherBullets.slice(0, 40).map((b) => `- id=${b.id} :: ${b.text}`),
      `</other_profile_bullets>`,
      ``,
      args.question.type === "gap"
        ? `This question probes something the profile CANNOT evidence. Teach the subject honestly. ` +
          `resumeHooks may only name the nearest adjacent thing the candidate genuinely did, or be empty.`
        : `Every resumeHook must cite an id from the two bullet lists above. Prefer <cited_bullets>.`,
    ]
      .filter(Boolean)
      .join("\n"),
    temperature: TEMPERATURE.answering,
    clerkUserId: args.clerkUserId,
    analysisId: args.analysisId,
    retries: 1,
    verify: (value) => {
      const invented = value.resumeHooks
        .map((h) => h.bulletId)
        .filter((id) => !allowed.has(id));
      if (invented.length > 0) {
        return (
          `These bullet ids do not exist: ${[...new Set(invented)].join(", ")}. ` +
          `Cite only ids from <cited_bullets> or <other_profile_bullets>, or return an empty resumeHooks array.`
        );
      }
      return null;
    },
  });

  if (!outcome.ok) return outcome;

  // Last line of defence, mirroring lib/ai/interview.ts: drop, never repair.
  // A hook we cannot trace to a bullet is a first-person claim with no
  // provenance — exactly the thing N1 exists to make impossible.
  const answer: QuestionAnswerOut = {
    ...outcome.value.value,
    resumeHooks: outcome.value.value.resumeHooks.filter((h) => allowed.has(h.bulletId)),
  };

  return { ok: true, value: { answer, aiRunId: outcome.value.aiRunId } };
}

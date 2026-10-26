import "server-only";
import { InterviewQuestionsSchema } from "../schemas/interview-questions";
import { PROMPT_VERSIONS, SYSTEM } from "../system-prompts";
import type { DomainBullet, DomainRequirement } from "@/lib/domain/types";
import { defineAgent } from "./define";
import * as prompt from "../prompts/question-writer";

export interface QuestionWriterInput {
  jobTitle: string;
  company: string;
  requirements: DomainRequirement[];
  bullets: DomainBullet[];
  absentRequirements: DomainRequirement[];
}

/**
 * QuestionWriter — the questions this posting invites (F7). N2 is a database
 * CHECK; `verify` catches a violation first so it costs one corrective retry
 * rather than a 500. The posting-derived part of the prompt comes first.
 */
export const questionWriter = defineAgent({
  name: "interview_questions",
  promptVersion: PROMPT_VERSIONS.generateQuestions,
  model: "writer",
  schema: InterviewQuestionsSchema,
  system: SYSTEM.generateQuestions,
  staticContext: prompt.staticContext,
  dynamicContext: prompt.dynamicContext,
  reasoningEffort: "low",
  maxOutputTokens: 9_000,
  retries: 1,
  inputGuards: ["pii", "protected"],
  // GR-4: "prep" scope — a question can honestly ask about a weakness.
  outputGuards: ["no_urls", "tone_prep"],
  verify: (value, i) => {
    const validIds = new Set(i.bullets.map((b) => b.id));
    const problems: string[] = [];
    const invented = value.questions.flatMap((q) => q.evidenceBulletIds.filter((id) => !validIds.has(id)));
    if (invented.length > 0) {
      problems.push(`These bullet ids do not exist: ${[...new Set(invented)].join(", ")}. Use only ids from <candidate_bullets>.`);
    }
    const unevidenced = value.questions.filter((q) => q.type !== "gap" && q.evidenceBulletIds.length === 0);
    if (unevidenced.length > 0) {
      problems.push(`${unevidenced.length} non-gap question(s) cite no evidence. Cite a bullet id, or type the question "gap".`);
    }
    const likely = value.questions.filter((q) => q.likely).length;
    if (likely !== 4) problems.push(`Exactly four questions must have likely = true; you marked ${likely}.`);
    return problems.length > 0 ? problems.join(" ") : null;
  },
});

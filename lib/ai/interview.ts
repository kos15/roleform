import "server-only";
import { runStructured } from "./run";
import { InterviewQuestionsSchema, type InterviewQuestionOut } from "./schemas/interview-questions";
import { PROMPT_VERSIONS, SYSTEM } from "./prompts";
import { TEMPERATURE } from "./models";
import { noUrls, scanTone } from "@/lib/domain/guardrails";
import type { DomainBullet, DomainRequirement, Result } from "@/lib/domain/types";

/**
 * Interview questions (F7).
 *
 * N2 is enforced by a database CHECK, but we verify here too so a violation
 * costs one corrective retry instead of a 500 the user sees. Anything still
 * violating after the retry is dropped, not coerced into type 'gap' — silently
 * relabelling a question to slip it past a constraint defeats the constraint.
 */
export async function generateQuestions(args: {
  clerkUserId: string;
  analysisId: string;
  jobTitle: string;
  company: string;
  requirements: DomainRequirement[];
  bullets: DomainBullet[];
  absentRequirements: DomainRequirement[];
}): Promise<Result<{ questions: InterviewQuestionOut[]; aiRunId: string }>> {
  const validIds = new Set(args.bullets.map((b) => b.id));

  const outcome = await runStructured({
    purpose: "interview_questions",
    promptVersion: PROMPT_VERSIONS.generateQuestions,
    tier: "strong",
    schema: InterviewQuestionsSchema,
    system: SYSTEM.generateQuestions,
    prompt: [
      `Role: ${args.jobTitle}${args.company ? ` at ${args.company}` : ""}`,
      ``,
      `<requirements>`,
      ...args.requirements
        .slice(0, 20)
        .map((r) => `- [${r.necessity}, mentioned ${r.mentionCount}×] ${r.text}`),
      `</requirements>`,
      ``,
      `<candidate_bullets>`,
      ...args.bullets.map((b) => `- id=${b.id} :: ${b.text}`),
      `</candidate_bullets>`,
      ``,
      `<not_evidenced>`,
      ...args.absentRequirements.map((r) => `- ${r.text}`),
      `</not_evidenced>`,
      ``,
      `Questions about anything in <not_evidenced> must use type "gap".`,
      `Every other question must cite at least one id from <candidate_bullets>.`,
    ].join("\n"),
    temperature: TEMPERATURE.questions,
    clerkUserId: args.clerkUserId,
    analysisId: args.analysisId,
    maxOutputTokens: 3_500,
    retries: 1,
    verify: (value) => {
      const problems: string[] = [];

      const invented = value.questions.flatMap((q) =>
        q.evidenceBulletIds.filter((id) => !validIds.has(id)),
      );
      if (invented.length > 0) {
        problems.push(
          `These bullet ids do not exist: ${[...new Set(invented)].join(", ")}. Use only ids from <candidate_bullets>.`,
        );
      }

      const unevidenced = value.questions.filter(
        (q) => q.type !== "gap" && q.evidenceBulletIds.length === 0,
      );
      if (unevidenced.length > 0) {
        problems.push(
          `${unevidenced.length} non-gap question(s) cite no evidence. Cite a bullet id, or type the question "gap".`,
        );
      }

      const likely = value.questions.filter((q) => q.likely).length;
      if (likely !== 4) problems.push(`Exactly four questions must have likely = true; you marked ${likely}.`);

      // GR-3: a question or its frame is scaffolding, never a place to put a
      // link — nothing on the Prep tab is a model-written URL.
      const urlProblem = noUrls(value.questions.map((q) => ({ text: q.text, whyTheyAsk: q.whyTheyAsk, frame: q.frame })));
      if (urlProblem) problems.push(urlProblem);

      // GR-4: odds and comparison are banned everywhere; "deficiency" is not
      // — a question can honestly ask about a weakness.
      const prose = value.questions.flatMap((q) => [q.text, q.whyTheyAsk, ...q.frame]).join(" ");
      const tone = scanTone(prose, "prep");
      if (!tone.ok) {
        problems.push(
          `Remove language about ${tone.violations.join(" and ")}. Never speculate about odds or compare the candidate to other applicants.`,
        );
      }

      return problems.length > 0 ? problems.join(" ") : null;
    },
  });

  if (!outcome.ok) return outcome;

  // Last line of defence before the CHECK: drop, never relabel.
  const questions = outcome.value.value.questions
    .map((q) => ({ ...q, evidenceBulletIds: q.evidenceBulletIds.filter((id) => validIds.has(id)) }))
    .filter((q) => q.type === "gap" || q.evidenceBulletIds.length > 0);

  return { ok: true, value: { questions, aiRunId: outcome.value.aiRunId } };
}

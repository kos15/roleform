import "server-only";
import { runAgent } from "./agents/define";
import { questionWriter } from "./agents/question-writer";
import type { InterviewQuestionOut } from "./schemas/interview-questions";
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

  const outcome = await runAgent(
    questionWriter,
    {
      jobTitle: args.jobTitle,
      company: args.company,
      requirements: args.requirements,
      bullets: args.bullets,
      absentRequirements: args.absentRequirements,
    },
    { clerkUserId: args.clerkUserId, analysisId: args.analysisId },
  );

  if (!outcome.ok) return outcome;

  // Last line of defence before the CHECK: drop, never relabel.
  const questions = outcome.value.value.questions
    .map((q) => ({ ...q, evidenceBulletIds: q.evidenceBulletIds.filter((id) => validIds.has(id)) }))
    .filter((q) => q.type === "gap" || q.evidenceBulletIds.length > 0);

  return { ok: true, value: { questions, aiRunId: outcome.value.aiRunId } };
}

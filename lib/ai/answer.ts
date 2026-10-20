import "server-only";
import { runAgent } from "./agents/define";
import { answerWriter } from "./agents/answer-writer";
import type { QuestionAnswerOut } from "./schemas/question-answer";
import type { DomainBullet, Result } from "@/lib/domain/types";

/**
 * Ranks the rest of the profile by term overlap with the question, and takes
 * the top MAX. Not by a model — a cheap pure sort, the same shape
 * `lib/domain/binding.ts#overlap` uses for the learning engine's proof-of-
 * learning loop, kept local here since it ranks a different pair of things
 * (a question against a bullet, not a requirement against one).
 *
 * Before this, every uncited bullet on the profile was sent on every worked
 * answer (up to 40), most of them with nothing to do with the question asked
 * (PR-5, G15). The trim happens before the prompt is built, so `allowed`
 * below is exactly what the model was shown — a hook citing a bullet that
 * got trimmed away is exactly as invalid as one citing an id that was never
 * on the profile at all.
 */
const MAX_OTHER_BULLETS = 12;

function rankByOverlap(question: string, bullets: DomainBullet[]): DomainBullet[] {
  const qTerms = termsOf(question);
  if (qTerms.size === 0) return bullets.slice(0, MAX_OTHER_BULLETS);
  return [...bullets]
    .map((bullet) => {
      const bTerms = termsOf(bullet.text);
      let shared = 0;
      for (const t of bTerms) if (qTerms.has(t)) shared++;
      return { bullet, score: bTerms.size === 0 ? 0 : shared / bTerms.size };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_OTHER_BULLETS)
    .map((r) => r.bullet);
}

function termsOf(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

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
  const rankedOther = rankByOverlap(args.question.text, args.otherBullets);
  const allowed = new Set([...args.evidenceBullets, ...rankedOther].map((b) => b.id));

  const outcome = await runAgent(
    answerWriter,
    {
      jobTitle: args.jobTitle,
      company: args.company,
      seniority: args.seniority,
      question: args.question,
      evidenceBullets: args.evidenceBullets,
      otherBullets: rankedOther,
      requirementText: args.requirementText,
    },
    { clerkUserId: args.clerkUserId, analysisId: args.analysisId },
  );

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

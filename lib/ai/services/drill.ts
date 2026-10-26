import "server-only";
import type { CodeReview, RevisionCard, StoredChallenge } from "../schemas/drill";
import { clampCorrectness, type CaseResult, type CodeLanguage, type Difficulty, type DrillTopic, type QuizItem, type Signature } from "@/lib/domain/drill";
import type { Result } from "@/lib/domain/types";
import { runAgent } from "../agents/define";
import { revisionWriter } from "../agents/revision-writer";
import { quizWriter } from "../agents/quiz-writer";
import { challengeWriter, verifiedTests } from "../agents/challenge-writer";
import { codeReviewer } from "../agents/code-reviewer";
import type { DrillRole } from "../agents/drill-prompt";

export type { DrillRole };

/**
 * F26 — rapid prep, the model half. Four agents (lib/ai/agents/*-writer.ts,
 * code-reviewer.ts), each on the fast writer: none of them decides anything
 * about the candidate. Topics, counts, option order, grading, starter code and
 * the overall verdict are all decided by pure functions (lib/domain/drill.ts)
 * before or after the call.
 *
 * Guardrails, by layer:
 *   schema  — topic enum, exact counts, Big-O pattern, typed signatures
 *   verify  — no URLs; no second-person claims on cards; distinct options;
 *             every generated test re-executed against its own reference
 *             solution in the QuickJS sandbox (one corrective retry each)
 *   after   — options shuffled by the server; failing tests dropped; a review
 *             overruled by the tests it disagrees with
 */

export async function generateRevisionDeck(args: {
  clerkUserId: string;
  analysisId: string;
  role: DrillRole;
  topics: DrillTopic[];
  count: number;
  minutes: number;
}): Promise<Result<{ cards: RevisionCard[]; aiRunId: string }>> {
  const outcome = await runAgent(
    revisionWriter,
    { role: args.role, topics: args.topics, count: args.count, minutes: args.minutes },
    { clerkUserId: args.clerkUserId, analysisId: args.analysisId },
  );
  if (!outcome.ok) return outcome;

  // Priority order, the order the topics were ranked in — not whatever order
  // the model happened to write them.
  const rank = new Map(args.topics.map((t, i) => [t.label, i]));
  const cards = [...outcome.value.value.cards].sort((a, b) => (rank.get(a.topic) ?? 99) - (rank.get(b.topic) ?? 99));
  return { ok: true, value: { cards, aiRunId: outcome.value.aiRunId } };
}

export async function generateQuizRound(args: {
  clerkUserId: string;
  analysisId: string;
  role: DrillRole;
  topics: DrillTopic[];
  count: number;
  difficulty: Difficulty;
}): Promise<Result<{ items: QuizItem[]; aiRunId: string }>> {
  const outcome = await runAgent(
    quizWriter,
    { role: args.role, topics: args.topics, count: args.count, difficulty: args.difficulty },
    { clerkUserId: args.clerkUserId, analysisId: args.analysisId },
  );
  if (!outcome.ok) return outcome;

  return {
    ok: true,
    value: {
      items: outcome.value.value.questions.map((q) => ({
        topic: q.topic,
        difficulty: q.difficulty,
        stem: q.stem,
        options: q.options,
        answerIndex: q.correctOption,
        explanation: q.explanation,
      })),
      aiRunId: outcome.value.aiRunId,
    },
  };
}

export async function generateChallenge(args: {
  clerkUserId: string;
  analysisId: string;
  role: DrillRole;
  topics: DrillTopic[];
  difficulty: Difficulty;
  language: CodeLanguage;
}): Promise<Result<{ challenge: StoredChallenge; aiRunId: string }>> {
  const outcome = await runAgent(
    challengeWriter,
    { role: args.role, topics: args.topics, difficulty: args.difficulty, language: args.language },
    { clerkUserId: args.clerkUserId, analysisId: args.analysisId },
  );
  if (!outcome.ok) return outcome;

  // A test the reference disagrees with is the model's mistake, not the
  // user's. Drop it before anyone is graded against it.
  const challenge = outcome.value.value;
  const { keep } = await verifiedTests(challenge);
  return { ok: true, value: { challenge: { ...challenge, tests: keep }, aiRunId: outcome.value.aiRunId } };
}

export async function reviewCode(args: {
  clerkUserId: string;
  analysisId: string;
  problem: { title: string; statement: string; signature: Signature; optimalTime: string; optimalSpace: string };
  language: CodeLanguage;
  code: string;
  tests: { passed: number; total: number; failing: CaseResult[] } | null;
  secondsUsed: number;
  minutes: number;
}): Promise<Result<{ review: CodeReview; aiRunId: string }>> {
  const outcome = await runAgent(
    codeReviewer,
    {
      problem: args.problem,
      language: args.language,
      code: args.code,
      tests: args.tests,
      secondsUsed: args.secondsUsed,
      minutes: args.minutes,
    },
    { clerkUserId: args.clerkUserId, analysisId: args.analysisId },
  );
  if (!outcome.ok) return outcome;

  // The tests outrank the reading (lib/domain/drill.ts#clampCorrectness).
  const review: CodeReview = {
    ...outcome.value.value,
    correctness: clampCorrectness(outcome.value.value.correctness, args.tests),
  };
  return { ok: true, value: { review, aiRunId: outcome.value.aiRunId } };
}

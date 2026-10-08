import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCoverage, getRequirements } from "./analysis";
import {
  CodeReviewSchema,
  StoredCardsSchema,
  StoredChallengeSchema,
  StoredPicksSchema,
  StoredQuizSchema,
} from "@/lib/ai/schemas/drill";
import { bankProblem } from "@/lib/drill/bank";
import {
  RUNNABLE,
  gradeQuiz,
  parseTestCase,
  snake,
  starterCode,
  type CodeLanguage,
  type DrillTopicSource,
  type OverallLabel,
  type Signature,
  type TestCase,
} from "@/lib/domain/drill";
import type { RequirementKind } from "@/lib/domain/types";
import type {
  AttemptView,
  ChallengeSummary,
  ChallengeView,
  DeckView,
  RoundResultView,
  RoundSummary,
  RoundView,
} from "@/app/(app)/analysis/[id]/rapid/types";

/**
 * F26 — reads for rapid prep. Every query is scoped by the session subject
 * (RLS is the second lock, §7), and every Json column is re-validated on the
 * way out: a row that no longer parses is skipped, never rendered half-formed.
 */

/** The posting's requirements joined to their coverage, as drill topic sources. */
export async function getTopicSources(
  clerkUserId: string,
  analysisId: string,
  kinds?: RequirementKind[],
): Promise<DrillTopicSource[]> {
  const [requirements, coverage] = await Promise.all([
    getRequirements(clerkUserId, analysisId),
    getCoverage(clerkUserId, analysisId),
  ]);
  const status = new Map(coverage.map((c) => [c.requirementId, c.status]));
  return requirements
    .filter((r) => !kinds || kinds.includes(r.kind))
    .map((r) => ({
      requirementId: r.id,
      text: r.text,
      skillName: r.skillName,
      necessity: r.necessity,
      mentionCount: r.mentionCount,
      status: status.get(r.id) ?? null,
    }));
}

/* ---------------------------------------------------------------- revision */

export async function getDecks(clerkUserId: string, analysisId: string): Promise<DeckView[]> {
  const rows = await db.revisionDeck.findMany({
    where: { clerkUserId, analysisId },
    orderBy: { minutes: "asc" },
  });
  return rows.flatMap((r) => {
    const cards = StoredCardsSchema.safeParse(r.cards);
    return cards.success ? [{ minutes: r.minutes, cards: cards.data }] : [];
  });
}

/* -------------------------------------------------------------------- quiz */

export async function getRoundSummaries(clerkUserId: string, analysisId: string): Promise<RoundSummary[]> {
  const rows = await db.quizRound.findMany({
    where: { clerkUserId, analysisId },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { id: true, createdAt: true, correct: true, total: true },
  });
  return rows.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), correct: r.correct, total: r.total }));
}

export function toRoundView(row: { id: string; questions: unknown; secondsPerQuestion: number }): RoundView | null {
  const items = StoredQuizSchema.safeParse(row.questions);
  if (!items.success) return null;
  return {
    id: row.id,
    secondsPerQuestion: row.secondsPerQuestion,
    // The answer index and the explanation stay on the server until submit.
    questions: items.data.map((q) => ({ topic: q.topic, difficulty: q.difficulty, stem: q.stem, options: q.options })),
  };
}

export function toRoundResult(row: { id: string; questions: unknown; picks: unknown }): RoundResultView | null {
  const items = StoredQuizSchema.safeParse(row.questions);
  const picks = StoredPicksSchema.safeParse(row.picks);
  if (!items.success || !picks.success) return null;
  return {
    id: row.id,
    grade: gradeQuiz(items.data, picks.data),
    questions: items.data.map((q, i) => ({
      topic: q.topic,
      stem: q.stem,
      options: q.options,
      answerIndex: q.answerIndex,
      pick: picks.data[i] ?? null,
      explanation: q.explanation,
    })),
  };
}

/* --------------------------------------------------------------- challenge */

/** One problem, whichever source it came from, in the shape the screens use. */
export interface ResolvedProblem {
  title: string;
  topic: string;
  statement: string;
  constraints: string[];
  examples: { input: string; output: string; explanation: string }[];
  signature: Signature;
  tests: TestCase[];
  hints: string[];
  approach: string;
  optimalTime: string;
  optimalSpace: string;
  solutionFor: (language: CodeLanguage) => string;
}

export function resolveProblem(row: {
  source: "bank" | "generated";
  bankSlug: string | null;
  body: unknown;
  language: CodeLanguage;
}): ResolvedProblem | null {
  if (row.source === "bank") {
    const p = row.bankSlug ? bankProblem(row.bankSlug) : null;
    if (!p) return null;
    return { ...p, solutionFor: (lang) => p.solutions[lang] };
  }
  const body = StoredChallengeSchema.safeParse(row.body);
  if (!body.success) return null;
  const b = body.data;
  return {
    title: b.title,
    topic: b.topic,
    statement: b.statement,
    constraints: b.constraints,
    examples: b.examples,
    signature: { functionName: b.functionName, params: b.params, returnType: b.returnType },
    tests: b.tests,
    hints: b.hints,
    approach: b.approach,
    optimalTime: b.optimalTime,
    optimalSpace: b.optimalSpace,
    // A generated problem has one written solution, in the language it was
    // generated for; JavaScript always has the sandbox-checked reference.
    solutionFor: (lang) => (lang === "javascript" ? b.referenceJs : b.solution),
  };
}

export function entryName(sig: Signature, language: CodeLanguage): string {
  return language === "python" ? snake(sig.functionName) : sig.functionName;
}

export async function getChallengeView(clerkUserId: string, challengeId: string): Promise<ChallengeView | null> {
  const row = await db.codingChallenge.findFirst({
    where: { clerkUserId, id: challengeId },
    include: { attempts: { orderBy: { createdAt: "desc" } } },
  });
  if (!row) return null;
  const problem = resolveProblem(row);
  if (!problem) return null;

  const runnable = RUNNABLE[row.language];
  return {
    id: row.id,
    source: row.source,
    title: problem.title,
    topic: problem.topic,
    difficulty: row.difficulty,
    language: row.language,
    minutes: row.minutes,
    startedAt: row.createdAt.toISOString(),
    statement: problem.statement,
    constraints: problem.constraints,
    examples: problem.examples,
    starter: starterCode(problem.signature, row.language),
    entryName: entryName(problem.signature, row.language),
    runnable,
    browserTests:
      runnable === "browser"
        ? problem.tests.flatMap((t) => {
            const c = parseTestCase(t, problem.signature);
            return c ? [c] : [];
          })
        : null,
    testCount: problem.tests.length,
    hints: problem.hints.slice(0, row.hintsRevealed),
    hintsTotal: problem.hints.length,
    solution: row.solutionRevealedAt
      ? {
          code: problem.solutionFor(row.language),
          approach: problem.approach,
          optimalTime: problem.optimalTime,
          optimalSpace: problem.optimalSpace,
        }
      : null,
    attempts: row.attempts.flatMap((a) => {
      const view = toAttemptView(a, problem);
      return view ? [view] : [];
    }),
  };
}

export function toAttemptView(
  a: {
    id: string;
    createdAt: Date;
    secondsUsed: number;
    testsPassed: number | null;
    testsTotal: number | null;
    evaluation: unknown;
    verdict: string;
  },
  problem: Pick<ResolvedProblem, "optimalTime" | "optimalSpace">,
): AttemptView | null {
  const stored = StoredAttemptSchema.safeParse(a.evaluation);
  if (!stored.success) return null;
  return {
    id: a.id,
    createdAt: a.createdAt.toISOString(),
    secondsUsed: a.secondsUsed,
    tests: a.testsPassed !== null && a.testsTotal !== null ? { passed: a.testsPassed, total: a.testsTotal } : null,
    verdict: { label: a.verdict as OverallLabel, reasons: stored.data.reasons },
    review: stored.data.review,
    optimalTime: problem.optimalTime,
    optimalSpace: problem.optimalSpace,
  };
}

/** `code_attempts.evaluation`: the clamped review plus the verdict's reasons. */
export const StoredAttemptSchema = z.object({
  review: CodeReviewSchema,
  reasons: z.array(z.string()),
});

export async function getChallengeSummaries(clerkUserId: string, analysisId: string): Promise<ChallengeSummary[]> {
  const rows = await db.codingChallenge.findMany({
    where: { clerkUserId, analysisId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { attempts: { orderBy: { createdAt: "desc" }, take: 1, select: { verdict: true } } },
  });
  return rows.flatMap((r) => {
    const problem = resolveProblem(r);
    if (!problem) return [];
    return [
      {
        id: r.id,
        title: problem.title,
        difficulty: r.difficulty,
        language: r.language,
        source: r.source,
        createdAt: r.createdAt.toISOString(),
        lastVerdict: (r.attempts[0]?.verdict as OverallLabel | undefined) ?? null,
      },
    ];
  });
}


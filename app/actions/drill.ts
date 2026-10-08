"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { checkTokenAllowance, requireUser } from "@/lib/auth";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { getAnalysis } from "@/lib/db/queries/analysis";
import {
  StoredAttemptSchema,
  getChallengeView,
  getTopicSources,
  resolveProblem,
  toAttemptView,
  toRoundResult,
  toRoundView,
} from "@/lib/db/queries/drill";
import { generateChallenge, generateQuizRound, generateRevisionDeck, reviewCode } from "@/lib/ai/drill";
import { StoredCardsSchema, StoredQuizSchema } from "@/lib/ai/schemas/drill";
import { BANK, bankProblem } from "@/lib/drill/bank";
import { runJsCases } from "@/lib/drill/sandbox";
import {
  CHALLENGE_MINUTES,
  CODE_LANGUAGES,
  DIFFICULTIES,
  MAX_CODE_CHARS,
  RUNNABLE,
  SECONDS_PER_QUESTION,
  cardsForBudget,
  gradeQuiz,
  isQuizLength,
  isRevisionBudget,
  overallVerdict,
  parseTestCase,
  pickTopics,
  shuffleOptions,
  topicsForBudget,
  type CaseResult,
} from "@/lib/domain/drill";
import { appError, err, ok, type Result } from "@/lib/domain/types";
import type {
  AttemptView,
  ChallengeView,
  DeckView,
  RoundResultView,
  RoundView,
  SolutionView,
  TestRun,
} from "@/app/(app)/analysis/[id]/rapid/types";

/**
 * F26 — rapid prep. Revise, a timed round, a timed coding challenge.
 *
 * Every action that costs a model call runs the same gauntlet as a drafted
 * answer (app/actions/prep.ts), in the same order: cache first (a read is
 * always free), then the burst limit, then the token meter (F19), then the
 * call. There is no separate count cap — these are metered in tokens (D6),
 * and a bank challenge, a retake or a test run costs none.
 */

async function readyAnalysis(clerkUserId: string, analysisId: string) {
  const analysis = await getAnalysis(clerkUserId, analysisId);
  if (!analysis || analysis.status !== "ready") return null;
  return analysis;
}

function burst(key: string, limit: { limit: number; windowSeconds: number }): Result<null> {
  const r = rateLimit(key, limit.limit, limit.windowSeconds);
  return r.allowed
    ? ok(null)
    : err(appError("invalid_input", `That's a lot at once. Try again in ${r.retryAfterSeconds}s.`));
}

const NO_TOPICS = appError(
  "not_found",
  "This posting has no requirements to drill on. Rapid prep reads its topics from the posting's requirements.",
);

/* ---------------------------------------------------------------- revision */

export async function buildRevisionDeck(analysisId: string, minutes: number): Promise<Result<DeckView>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!isRevisionBudget(minutes)) return err(appError("invalid_input", "Pick one of the offered times."));

  const existing = await db.revisionDeck.findFirst({ where: { clerkUserId: user.value, analysisId, minutes } });
  if (existing) {
    const cards = StoredCardsSchema.safeParse(existing.cards);
    if (cards.success) return ok({ minutes, cards: cards.data });
    await db.revisionDeck.delete({ where: { id: existing.id } });
  }

  const analysis = await readyAnalysis(user.value, analysisId);
  if (!analysis) return err(appError("not_found", "We couldn't find that analysis."));

  const limited = burst(`drill:${user.value}`, LIMITS.drill);
  if (!limited.ok) return limited;
  const tokens = await checkTokenAllowance(user.value, "revision");
  if (!tokens.ok) return tokens;

  const topics = pickTopics(await getTopicSources(user.value, analysisId), topicsForBudget(minutes));
  if (topics.length === 0) return err(NO_TOPICS);

  const generated = await generateRevisionDeck({
    clerkUserId: user.value,
    analysisId,
    role: { title: analysis.title ?? "this role", seniority: analysis.seniority },
    topics,
    count: cardsForBudget(minutes),
    minutes,
  });
  if (!generated.ok) return generated;

  // upsert: two tabs asking for the same budget must not collide on the unique index.
  await db.revisionDeck.upsert({
    where: { analysisId_minutes: { analysisId, minutes } },
    create: { clerkUserId: user.value, analysisId, minutes, cards: generated.value.cards, aiRunId: generated.value.aiRunId },
    update: { cards: generated.value.cards, aiRunId: generated.value.aiRunId },
  });
  return ok({ minutes, cards: generated.value.cards });
}

/* -------------------------------------------------------------------- quiz */

export async function startQuizRound(
  analysisId: string,
  count: number,
  difficulty: string,
): Promise<Result<RoundView>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const level = z.enum(DIFFICULTIES).safeParse(difficulty);
  if (!isQuizLength(count) || !level.success) return err(appError("invalid_input", "Pick one of the offered rounds."));

  const analysis = await readyAnalysis(user.value, analysisId);
  if (!analysis) return err(appError("not_found", "We couldn't find that analysis."));

  const limited = burst(`drill:${user.value}`, LIMITS.drill);
  if (!limited.ok) return limited;
  const tokens = await checkTokenAllowance(user.value, "quiz");
  if (!tokens.ok) return tokens;

  const topics = pickTopics(await getTopicSources(user.value, analysisId), Math.min(8, Math.ceil(count / 2) + 1));
  if (topics.length === 0) return err(NO_TOPICS);

  const generated = await generateQuizRound({
    clerkUserId: user.value,
    analysisId,
    role: { title: analysis.title ?? "this role", seniority: analysis.seniority },
    topics,
    count,
    difficulty: level.data,
  });
  if (!generated.ok) return generated;

  // The row id seeds the shuffle, so it is minted first and the shuffled
  // questions written into the same row.
  const row = await db.quizRound.create({
    data: {
      clerkUserId: user.value,
      analysisId,
      questions: [],
      total: count,
      secondsPerQuestion: SECONDS_PER_QUESTION[level.data],
      aiRunId: generated.value.aiRunId,
    },
  });
  const questions = generated.value.items.map((q) => shuffleOptions(q, row.id));
  const saved = await db.quizRound.update({ where: { id: row.id }, data: { questions } });

  const view = toRoundView(saved);
  return view ? ok(view) : err(appError("schema_invalid", "That round came back malformed."));
}

/** A finished round, played again from the top. Same questions, no model call. */
export async function retakeQuizRound(roundId: string): Promise<Result<RoundView>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const source = await db.quizRound.findFirst({ where: { clerkUserId: user.value, id: roundId } });
  if (!source) return err(appError("not_found", "We couldn't find that round."));

  const row = await db.quizRound.create({
    data: {
      clerkUserId: user.value,
      analysisId: source.analysisId,
      questions: source.questions ?? [],
      total: source.total,
      secondsPerQuestion: source.secondsPerQuestion,
    },
  });
  const view = toRoundView(row);
  return view ? ok(view) : err(appError("schema_invalid", "That round could not be read."));
}

export async function submitQuizRound(roundId: string, picks: (number | null)[]): Promise<Result<RoundResultView>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const row = await db.quizRound.findFirst({ where: { clerkUserId: user.value, id: roundId } });
  if (!row) return err(appError("not_found", "We couldn't find that round."));

  // Submitted already: the stored grade stands. Re-submitting cannot improve it.
  if (row.finishedAt) {
    const done = toRoundResult(row);
    return done ? ok(done) : err(appError("schema_invalid", "That round could not be read."));
  }

  const items = StoredQuizSchema.safeParse(row.questions);
  const parsed = z.array(z.number().int().min(0).max(3).nullable()).length(row.total).safeParse(picks);
  if (!items.success || !parsed.success) return err(appError("invalid_input", "Those answers don't fit this round."));

  // Graded here, from the stored answers — the browser never had them.
  const grade = gradeQuiz(items.data, parsed.data);
  const saved = await db.quizRound.update({
    where: { id: row.id },
    data: { picks: parsed.data, correct: grade.correct, finishedAt: new Date() },
  });
  const result = toRoundResult(saved);
  return result ? ok(result) : err(appError("schema_invalid", "That round could not be read."));
}

export async function openQuizRound(roundId: string): Promise<Result<RoundResultView | RoundView>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const row = await db.quizRound.findFirst({ where: { clerkUserId: user.value, id: roundId } });
  if (!row) return err(appError("not_found", "We couldn't find that round."));
  const view = row.finishedAt ? toRoundResult(row) : toRoundView(row);
  return view ? ok(view) : err(appError("schema_invalid", "That round could not be read."));
}

/* --------------------------------------------------------------- challenge */

const StartSchema = z.object({
  analysisId: z.string().uuid(),
  source: z.enum(["bank", "generated"]),
  slug: z.string().nullable(),
  difficulty: z.enum(DIFFICULTIES),
  language: z.enum(CODE_LANGUAGES),
});

export async function startChallenge(input: z.infer<typeof StartSchema>): Promise<Result<ChallengeView>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = StartSchema.safeParse(input);
  if (!parsed.success) return err(appError("invalid_input", "Pick a difficulty, a language and a source."));
  const { analysisId, source, slug, difficulty, language } = parsed.data;

  const analysis = await readyAnalysis(user.value, analysisId);
  if (!analysis) return err(appError("not_found", "We couldn't find that analysis."));

  if (source === "bank") {
    // A named problem, or a random one at this difficulty. Zero tokens.
    const pool = BANK.filter((p) => p.difficulty === difficulty);
    const problem = slug ? bankProblem(slug) : pool[Math.floor(Math.random() * pool.length)];
    if (!problem) return err(appError("not_found", "We couldn't find that problem."));
    const row = await db.codingChallenge.create({
      data: {
        clerkUserId: user.value,
        analysisId,
        source: "bank",
        bankSlug: problem.slug,
        difficulty: problem.difficulty,
        language,
        minutes: CHALLENGE_MINUTES[problem.difficulty],
      },
    });
    const view = await getChallengeView(user.value, row.id);
    return view ? ok(view) : err(appError("not_found", "We couldn't open that challenge."));
  }

  const limited = burst(`drill:${user.value}`, LIMITS.drill);
  if (!limited.ok) return limited;
  const tokens = await checkTokenAllowance(user.value, "challenge");
  if (!tokens.ok) return tokens;

  // Technical requirements only: a coding problem about "stakeholder
  // management" is not a coding problem.
  const topics = pickTopics(
    await getTopicSources(user.value, analysisId, ["hard_skill", "responsibility"]),
    6,
  );
  if (topics.length === 0) {
    return err(
      appError(
        "not_found",
        "This posting names no technical requirement to build a problem around. The classic DSA set works for any role.",
      ),
    );
  }

  const generated = await generateChallenge({
    clerkUserId: user.value,
    analysisId,
    role: { title: analysis.title ?? "this role", seniority: analysis.seniority },
    topics,
    difficulty,
    language,
  });
  if (!generated.ok) return generated;

  const row = await db.codingChallenge.create({
    data: {
      clerkUserId: user.value,
      analysisId,
      source: "generated",
      difficulty,
      language,
      minutes: CHALLENGE_MINUTES[difficulty],
      body: generated.value.challenge,
      aiRunId: generated.value.aiRunId,
    },
  });
  const view = await getChallengeView(user.value, row.id);
  return view ? ok(view) : err(appError("schema_invalid", "That challenge came back malformed."));
}

export async function openChallenge(challengeId: string): Promise<Result<ChallengeView>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const view = await getChallengeView(user.value, challengeId);
  return view ? ok(view) : err(appError("not_found", "We couldn't find that challenge."));
}

async function loadChallenge(clerkUserId: string, challengeId: string) {
  const row = await db.codingChallenge.findFirst({ where: { clerkUserId, id: challengeId } });
  if (!row) return null;
  const problem = resolveProblem(row);
  return problem ? { row, problem } : null;
}

/** JavaScript only — the one language the server can run. No model call. */
export async function runChallengeTests(challengeId: string, code: string): Promise<Result<TestRun>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (code.length > MAX_CODE_CHARS) return err(appError("invalid_input", "That code is longer than we accept."));
  const loaded = await loadChallenge(user.value, challengeId);
  if (!loaded) return err(appError("not_found", "We couldn't find that challenge."));
  if (RUNNABLE[loaded.row.language] !== "server") {
    return err(appError("invalid_input", "This language isn't run on the server."));
  }
  const limited = burst(`drill-run:${user.value}`, LIMITS.drillRun);
  if (!limited.ok) return limited;

  const results = await runServerTests(loaded.problem, code);
  return ok({ results, passed: results.filter((r) => r.passed).length, total: results.length });
}

async function runServerTests(
  problem: NonNullable<ReturnType<typeof resolveProblem>>,
  code: string,
): Promise<CaseResult[]> {
  const cases = problem.tests.flatMap((t) => {
    const c = parseTestCase(t, problem.signature);
    return c ? [c] : [];
  });
  return runJsCases(code, problem.signature.functionName, cases);
}

export async function revealHint(challengeId: string): Promise<Result<string[]>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const loaded = await loadChallenge(user.value, challengeId);
  if (!loaded) return err(appError("not_found", "We couldn't find that challenge."));
  const next = Math.min(loaded.problem.hints.length, loaded.row.hintsRevealed + 1);
  await db.codingChallenge.update({ where: { id: loaded.row.id }, data: { hintsRevealed: next } });
  return ok(loaded.problem.hints.slice(0, next));
}

export async function revealSolution(challengeId: string): Promise<Result<SolutionView>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const loaded = await loadChallenge(user.value, challengeId);
  if (!loaded) return err(appError("not_found", "We couldn't find that challenge."));
  if (!loaded.row.solutionRevealedAt) {
    await db.codingChallenge.update({ where: { id: loaded.row.id }, data: { solutionRevealedAt: new Date() } });
  }
  return ok({
    code: loaded.problem.solutionFor(loaded.row.language),
    approach: loaded.problem.approach,
    optimalTime: loaded.problem.optimalTime,
    optimalSpace: loaded.problem.optimalSpace,
  });
}

const BrowserRunSchema = z
  .object({ passed: z.number().int().min(0), total: z.number().int().min(1) })
  .refine((r) => r.passed <= r.total);

/**
 * Submit for review: one model call. The clock is the server's (the row's
 * `created_at` to now); tests are executed here for JavaScript, reported by
 * the in-browser Pyodide run for Python (honest self-practice data — it only
 * changes the user's own review), and absent for Java and C++.
 */
export async function submitChallenge(
  challengeId: string,
  code: string,
  browserRun: { passed: number; total: number; failing: CaseResult[] } | null,
): Promise<Result<AttemptView>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (code.trim().length < 10) return err(appError("invalid_input", "Write a solution before submitting."));
  if (code.length > MAX_CODE_CHARS) {
    return err(appError("invalid_input", `Keep the solution under ${MAX_CODE_CHARS.toLocaleString()} characters.`));
  }

  const loaded = await loadChallenge(user.value, challengeId);
  if (!loaded) return err(appError("not_found", "We couldn't find that challenge."));
  const { row, problem } = loaded;

  const limited = burst(`drill:${user.value}`, LIMITS.drill);
  if (!limited.ok) return limited;
  const tokens = await checkTokenAllowance(user.value, "review");
  if (!tokens.ok) return tokens;

  let tests: { passed: number; total: number; failing: CaseResult[] } | null = null;
  const runtime = RUNNABLE[row.language];
  if (runtime === "server") {
    const results = await runServerTests(problem, code);
    tests = {
      passed: results.filter((r) => r.passed).length,
      total: results.length,
      failing: results.filter((r) => !r.passed),
    };
  } else if (runtime === "browser" && browserRun) {
    const counts = BrowserRunSchema.safeParse(browserRun);
    if (counts.success && counts.data.total === problem.tests.length) {
      tests = { ...counts.data, failing: (browserRun.failing ?? []).slice(0, 3) };
    }
  }

  const secondsUsed = Math.max(0, Math.round((Date.now() - row.createdAt.getTime()) / 1000));

  const reviewed = await reviewCode({
    clerkUserId: user.value,
    analysisId: row.analysisId,
    problem: {
      title: problem.title,
      statement: problem.statement,
      signature: problem.signature,
      optimalTime: problem.optimalTime,
      optimalSpace: problem.optimalSpace,
    },
    language: row.language,
    code,
    tests,
    secondsUsed,
    minutes: row.minutes,
  });
  if (!reviewed.ok) return reviewed;
  const { review, aiRunId } = reviewed.value;

  const verdict = overallVerdict({
    correctness: review.correctness,
    timeVerdict: review.timeVerdict,
    spaceVerdict: review.spaceVerdict,
    tests: tests ? { passed: tests.passed, total: tests.total } : null,
    secondsUsed,
    minutes: row.minutes,
    hintsUsed: row.hintsRevealed,
    solutionSeen: row.solutionRevealedAt !== null,
  });

  const evaluation = StoredAttemptSchema.parse({ review, reasons: verdict.reasons });
  const attempt = await db.codeAttempt.create({
    data: {
      clerkUserId: user.value,
      challengeId: row.id,
      language: row.language,
      code,
      secondsUsed,
      testsPassed: tests?.passed ?? null,
      testsTotal: tests?.total ?? null,
      evaluation,
      verdict: verdict.label,
      aiRunId,
    },
  });

  const view = toAttemptView(attempt, problem);
  return view ? ok(view) : err(appError("schema_invalid", "That review could not be read."));
}

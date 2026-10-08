import "server-only";
import { runStructured } from "./run";
import {
  CodeReviewSchema,
  generatedChallengeSchema,
  quizRoundSchema,
  revisionDeckSchema,
  type CodeReview,
  type RevisionCard,
  type StoredChallenge,
} from "./schemas/drill";
import { PROMPT_VERSIONS, SYSTEM } from "./prompts";
import { TEMPERATURE } from "./models";
import { noUrls } from "@/lib/domain/guardrails";
import {
  LANGUAGE_LABEL,
  SECONDS_PER_QUESTION,
  clampCorrectness,
  parseTestCase,
  type CaseResult,
  type CodeLanguage,
  type Difficulty,
  type DrillTopic,
  type QuizItem,
  type Signature,
} from "@/lib/domain/drill";
import { loadSandbox, runJsCasesSync } from "@/lib/drill/sandbox";
import type { Result } from "@/lib/domain/types";

/**
 * F26 — rapid prep, the model half. Four calls, each on the MID tier: none of
 * them decides anything about the candidate. Topics, counts, option order,
 * grading, starter code and the overall verdict are all decided by pure
 * functions (lib/domain/drill.ts) before or after the call.
 *
 * What goes IN is deliberately small: a role line and a numbered topic list —
 * never the posting's full text, never a résumé bullet. That is both the token
 * diet (the posting was already distilled into requirements by stage ①) and
 * the fabrication boundary (§3): a model that is never shown the candidate's
 * history has nothing about them to embellish.
 *
 * Guardrails, by layer:
 *   schema  — topic enum, exact counts, Big-O pattern, typed signatures
 *   verify  — no URLs; no second-person claims on cards; distinct options;
 *             every generated test re-executed against its own reference
 *             solution in the QuickJS sandbox (one corrective retry each)
 *   after   — options shuffled by the server; failing tests dropped; a review
 *             overruled by the tests it disagrees with
 */

export interface DrillRole {
  title: string;
  seniority: string | null;
}

function roleLine(role: DrillRole): string {
  return `Role: ${role.title}${role.seniority ? ` · Seniority: ${role.seniority}` : ""}`;
}

function topicBlock(topics: DrillTopic[]): string {
  return [
    "<topics>",
    ...topics.map(
      (t, i) =>
        `${i + 1}. ${t.label} (${t.necessity}${t.status === "absent" ? ", candidate has not shown this" : t.status === "partial" ? ", partly shown" : ""})`,
    ),
    "</topics>",
  ].join("\n");
}

function enumOf(topics: DrillTopic[]): [string, ...string[]] {
  const labels = topics.map((t) => t.label);
  return [labels[0], ...labels.slice(1)];
}

/**
 * §3 on the cards: they teach the subject and say nothing about the person.
 * A card that tells the user what they "have done" is a claim with no source.
 */
const SECOND_PERSON_CLAIM =
  /\b(your (experience|résumé|resume|background|previous role|last role|team at)|you (have|'ve) (led|built|shipped|worked|managed|used)|in your role)\b/i;

/* ---------------------------------------------------------------- revision */

export async function generateRevisionDeck(args: {
  clerkUserId: string;
  analysisId: string;
  role: DrillRole;
  topics: DrillTopic[];
  count: number;
  minutes: number;
}): Promise<Result<{ cards: RevisionCard[]; aiRunId: string }>> {
  const topicSet = new Set(args.topics.map((t) => t.label));

  const outcome = await runStructured({
    purpose: "revision_cards",
    promptVersion: PROMPT_VERSIONS.revisionCards,
    tier: "mid",
    schema: revisionDeckSchema(enumOf(args.topics), args.count),
    system: SYSTEM.revisionCards,
    prompt: [
      roleLine(args.role),
      `Time to revise: ${args.minutes} minutes. Write exactly ${args.count} cards.`,
      topicBlock(args.topics),
    ].join("\n"),
    temperature: TEMPERATURE.revision,
    clerkUserId: args.clerkUserId,
    analysisId: args.analysisId,
    maxOutputTokens: 300 + args.count * 230,
    retries: 1,
    verify: (value) => {
      const urls = noUrls(value);
      if (urls) return urls;

      const claim = value.cards.find((c) =>
        SECOND_PERSON_CLAIM.test([c.answer, c.pitfall, ...c.keyPoints].join(" ")),
      );
      if (claim) {
        return `Card "${claim.title}" talks about the candidate's own experience. Cards teach the subject only; rewrite it without mentioning the candidate.`;
      }

      const covered = new Set(value.cards.map((c) => c.topic));
      const missing = [...topicSet].filter((t) => !covered.has(t));
      if (missing.length > 0 && args.count >= topicSet.size) {
        return `No card covers: ${missing.join("; ")}. Every topic needs at least one card.`;
      }

      const titles = value.cards.map((c) => c.title.toLowerCase().trim());
      if (new Set(titles).size !== titles.length) return "Two cards share a title. Each card covers a distinct concept.";
      return null;
    },
  });
  if (!outcome.ok) return outcome;

  // Priority order, the order the topics were ranked in — not whatever order
  // the model happened to write them.
  const rank = new Map(args.topics.map((t, i) => [t.label, i]));
  const cards = [...outcome.value.value.cards].sort(
    (a, b) => (rank.get(a.topic) ?? 99) - (rank.get(b.topic) ?? 99),
  );
  return { ok: true, value: { cards, aiRunId: outcome.value.aiRunId } };
}

/* -------------------------------------------------------------------- quiz */

const BANNED_OPTION = /\b(all|none|both) of the above\b|\bboth [a-d] and [a-d]\b/i;

export async function generateQuizRound(args: {
  clerkUserId: string;
  analysisId: string;
  role: DrillRole;
  topics: DrillTopic[];
  count: number;
  difficulty: Difficulty;
}): Promise<Result<{ items: QuizItem[]; aiRunId: string }>> {
  const outcome = await runStructured({
    purpose: "quiz_round",
    promptVersion: PROMPT_VERSIONS.quizRound,
    tier: "mid",
    schema: quizRoundSchema(enumOf(args.topics), args.count),
    system: SYSTEM.quizRound,
    prompt: [
      roleLine(args.role),
      `Write exactly ${args.count} questions, mostly ${args.difficulty}. Time limit: ${SECONDS_PER_QUESTION[args.difficulty]} seconds each.`,
      topicBlock(args.topics),
    ].join("\n"),
    temperature: TEMPERATURE.quiz,
    clerkUserId: args.clerkUserId,
    analysisId: args.analysisId,
    maxOutputTokens: 300 + args.count * 190,
    retries: 1,
    verify: (value) => {
      const urls = noUrls(value);
      if (urls) return urls;
      for (const [i, q] of value.questions.entries()) {
        const norm = q.options.map((o) => o.toLowerCase().replace(/\s+/g, " ").trim());
        if (new Set(norm).size !== 4) return `Question ${i + 1} repeats an option. Four distinct options each.`;
        if (q.options.some((o) => BANNED_OPTION.test(o))) {
          return `Question ${i + 1} uses an "all/none of the above" option. Replace it with a real distractor.`;
        }
      }
      const stems = value.questions.map((q) => q.stem.toLowerCase().trim());
      if (new Set(stems).size !== stems.length) return "Two questions are identical. Every question must be distinct.";
      return null;
    },
  });
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

/* --------------------------------------------------------------- challenge */

/** Below this many self-consistent tests a generated problem is not worth serving. */
const MIN_VERIFIED_TESTS = 4;

export async function generateChallenge(args: {
  clerkUserId: string;
  analysisId: string;
  role: DrillRole;
  topics: DrillTopic[];
  difficulty: Difficulty;
  language: CodeLanguage;
}): Promise<Result<{ challenge: StoredChallenge; aiRunId: string }>> {
  // Loaded before the call so `verify` — which runStructured calls
  // synchronously — can execute the model's reference solution.
  const quickjs = await loadSandbox();

  const verifiedTests = (value: StoredChallenge) => {
    const sig: Signature = {
      functionName: value.functionName,
      params: value.params,
      returnType: value.returnType,
    };
    const parsed = value.tests
      .map((t) => ({ t, c: parseTestCase(t, sig) }))
      .filter((x): x is { t: (typeof value.tests)[number]; c: NonNullable<ReturnType<typeof parseTestCase>> } => x.c !== null);
    const results = runJsCasesSync(
      quickjs,
      value.referenceJs,
      value.functionName,
      parsed.map((p) => p.c),
    );
    return {
      keep: parsed.filter((_, i) => results[i]?.passed).map((p) => p.t),
      malformed: value.tests.length - parsed.length,
      failed: results.filter((r) => !r.passed),
    };
  };

  const outcome = await runStructured({
    purpose: "coding_challenge",
    promptVersion: PROMPT_VERSIONS.codingChallenge,
    tier: "mid",
    schema: generatedChallengeSchema(enumOf(args.topics)),
    system: SYSTEM.codingChallenge,
    prompt: [
      roleLine(args.role),
      `Difficulty: ${args.difficulty}. Language for \`solution\`: ${LANGUAGE_LABEL[args.language]}.`,
      topicBlock(args.topics),
    ].join("\n"),
    temperature: TEMPERATURE.challenge,
    clerkUserId: args.clerkUserId,
    analysisId: args.analysisId,
    maxOutputTokens: 3_200,
    retries: 1,
    verify: (value) => {
      const urls = noUrls({
        statement: value.statement,
        hints: value.hints,
        approach: value.approach,
        examples: value.examples,
      });
      if (urls) return urls;
      const names = value.params.map((p) => p.name);
      if (new Set(names).size !== names.length) return "Two parameters share a name.";

      const { keep, malformed, failed } = verifiedTests(value);
      if (keep.length < MIN_VERIFIED_TESTS) {
        const detail = failed
          .slice(0, 3)
          .map((f) => `args ${f.input}: referenceJs returned ${f.actual}, test expects ${f.expected}`)
          .join("; ");
        return (
          `Only ${keep.length} of ${value.tests.length} tests agree with referenceJs` +
          (malformed ? ` (${malformed} do not match the parameter types)` : "") +
          `. ${detail}. Fix referenceJs or the expected values so every test is what referenceJs returns.`
        );
      }
      return null;
    },
  });
  if (!outcome.ok) return outcome;

  // A test the reference disagrees with is the model's mistake, not the
  // user's. Drop it before anyone is graded against it.
  const challenge = outcome.value.value;
  const { keep } = verifiedTests(challenge);
  return { ok: true, value: { challenge: { ...challenge, tests: keep }, aiRunId: outcome.value.aiRunId } };
}

/* ------------------------------------------------------------------ review */

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
  const testLine = args.tests
    ? `Executed: ${args.tests.passed} of ${args.tests.total} tests passed.` +
      (args.tests.failing.length
        ? ` Failing: ${args.tests.failing
            .slice(0, 2)
            .map((f) => `input ${f.input} → got ${f.actual}, expected ${f.expected}`)
            .join("; ")}`
        : "")
    : "Not executed (no runtime for this language) — trace the examples.";

  const outcome = await runStructured({
    purpose: "code_review",
    promptVersion: PROMPT_VERSIONS.codeReview,
    tier: "mid",
    schema: CodeReviewSchema,
    system: SYSTEM.codeReview,
    prompt: [
      `<problem title="${args.problem.title.replace(/"/g, "'")}">`,
      args.problem.statement.slice(0, 1_500),
      `</problem>`,
      `Optimal: time ${args.problem.optimalTime}, space ${args.problem.optimalSpace}.`,
      `Language: ${LANGUAGE_LABEL[args.language]}. Time used: ${Math.round(args.secondsUsed / 60)} of ${args.minutes} minutes.`,
      testLine,
      `<candidate_code>`,
      args.code,
      `</candidate_code>`,
    ].join("\n"),
    temperature: TEMPERATURE.review,
    clerkUserId: args.clerkUserId,
    analysisId: args.analysisId,
    maxOutputTokens: 1_100,
    retries: 1,
    verify: (value) => noUrls(value),
  });
  if (!outcome.ok) return outcome;

  // The tests outrank the reading (lib/domain/drill.ts#clampCorrectness).
  const review: CodeReview = {
    ...outcome.value.value,
    correctness: clampCorrectness(outcome.value.value.correctness, args.tests),
  };
  return { ok: true, value: { review, aiRunId: outcome.value.aiRunId } };
}

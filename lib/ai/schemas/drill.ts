import { z } from "zod";
import { COMPLEXITY_VERDICTS, CORRECTNESS, DIFFICULTIES, VALUE_TYPES } from "@/lib/domain/drill";

/**
 * F26 — the rapid-prep contracts.
 *
 * Built per call, not once: the `topic` field is a `z.enum` of THIS posting's
 * topics (lib/domain/drill.ts#pickTopics), and the array lengths are the
 * counts the user asked for. A model that wants to drift onto a topic the
 * posting never named, or pad a ten-minute deck to twenty cards, has no
 * schema-valid way to do it — the cheapest guardrail there is, because it is
 * paid in zero prompt tokens.
 *
 * Field ORDER is a prompting technique here, not an accident. Structured
 * output is generated top to bottom, so the field that needs reasoning comes
 * before the field that depends on it: a quiz item's `explanation` precedes
 * `correctOption`, and a review's `analysis` precedes its verdicts. That buys
 * the accuracy of "think first" without paying for a separate hidden chain of
 * thought.
 *
 * Every property is required (OpenAI strict mode); absence is "" or [].
 *
 * The stored-row schemas at the bottom are the same shapes with the topic
 * relaxed to a string — the read guard for each Json column (§11).
 */

type Topics = [string, ...string[]];

/* ---------------------------------------------------------------- revision */

const cardShape = <T extends z.ZodTypeAny>(topic: T) =>
  z.object({
    topic,
    title: z.string().min(3).max(70).describe("The concept, named. A label, not a sentence."),
    recall: z
      .string()
      .min(10)
      .max(160)
      .describe("The card's front: one question that tests recall of this concept, answerable in two sentences."),
    answer: z
      .string()
      .min(10)
      .max(260)
      .describe("The crisp answer to `recall`, phrased as you would say it aloud in an interview."),
    keyPoints: z
      .array(z.string().min(8).max(170))
      .min(2)
      .max(4)
      .describe("What to remember: the mechanism, the trade-off, when to use it, the number that matters."),
    example: z
      .string()
      .max(420)
      .describe('A tiny code snippet or worked example that makes it concrete. "" when none would help.'),
    pitfall: z.string().min(8).max(200).describe("The misconception or mistake interviewers probe for."),
  });

export function revisionDeckSchema(topics: Topics, count: number) {
  return z.object({
    cards: z.array(cardShape(z.enum(topics))).length(count),
  });
}

export const RevisionCardSchema = cardShape(z.string().min(1).max(80));
export const StoredCardsSchema = z.array(RevisionCardSchema);
export type RevisionCard = z.infer<typeof RevisionCardSchema>;

/* -------------------------------------------------------------------- quiz */

export function quizRoundSchema(topics: Topics, count: number) {
  return z.object({
    questions: z
      .array(
        z.object({
          topic: z.enum(topics),
          difficulty: z.enum(DIFFICULTIES),
          stem: z.string().min(12).max(320).describe("The question. May include a short code snippet."),
          options: z
            .array(z.string().min(1).max(150))
            .length(4)
            .describe("Four options of parallel length and form. Exactly one is correct."),
          explanation: z
            .string()
            .min(20)
            .max(320)
            .describe("Why the right option is right and the most tempting wrong one is wrong. Written before correctOption."),
          correctOption: z.number().int().min(0).max(3).describe("Index of the correct option, 0–3."),
        }),
      )
      .length(count),
  });
}

/** Stored after the server shuffles options and remaps the answer. */
export const StoredQuizItemSchema = z.object({
  topic: z.string(),
  difficulty: z.enum(DIFFICULTIES),
  stem: z.string(),
  options: z.array(z.string()).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string(),
});
export const StoredQuizSchema = z.array(StoredQuizItemSchema);
export const StoredPicksSchema = z.array(z.number().int().min(0).max(3).nullable());

/* --------------------------------------------------------------- challenge */

const IDENT = /^[a-z][A-Za-z0-9]{0,30}$/;

const challengeShape = <T extends z.ZodTypeAny>(topic: T) =>
  z.object({
    topic,
    title: z.string().min(4).max(80),
    statement: z
      .string()
      .min(80)
      .max(1500)
      .describe("The problem in plain prose. Names each parameter in `backticks` and says exactly what to return."),
    constraints: z.array(z.string().min(3).max(120)).min(1).max(6),
    examples: z
      .array(
        z.object({
          input: z.string().min(1).max(200),
          output: z.string().min(1).max(120),
          explanation: z.string().max(200),
        }),
      )
      .min(1)
      .max(3),
    functionName: z.string().regex(IDENT).describe("camelCase function name."),
    params: z
      .array(z.object({ name: z.string().regex(IDENT), type: z.enum(VALUE_TYPES) }))
      .min(1)
      .max(4),
    returnType: z.enum(VALUE_TYPES),
    tests: z
      .array(
        z.object({
          args: z.string().min(2).max(600).describe("JSON array of the arguments, in parameter order."),
          expected: z.string().min(1).max(300).describe("JSON of the return value."),
        }),
      )
      .min(5)
      .max(10)
      .describe("Hidden tests. Cover edge cases: empty, single element, duplicates, extremes."),
    hints: z
      .array(z.string().min(10).max(240))
      .length(3)
      .describe("Progressive: a nudge, then a direction, then nearly the answer. None contains code."),
    approach: z.string().min(40).max(700).describe("The optimal approach explained in prose."),
    optimalTime: z.string().regex(/^O\(.+\)$/).max(40),
    optimalSpace: z.string().regex(/^O\(.+\)$/).max(40),
    referenceJs: z
      .string()
      .min(20)
      .max(3000)
      .describe("The optimal solution as one plain JavaScript function named functionName. No imports, no console."),
    solution: z.string().min(20).max(4000).describe("The same optimal solution in the requested language."),
  });

export function generatedChallengeSchema(topics: Topics) {
  return challengeShape(z.enum(topics));
}

export const StoredChallengeSchema = challengeShape(z.string());
export type StoredChallenge = z.infer<typeof StoredChallengeSchema>;

/* ------------------------------------------------------------------ review */

export const CodeReviewSchema = z.object({
  analysis: z
    .string()
    .min(40)
    .max(700)
    .describe("Read the code first: the algorithm it actually uses, what drives its cost, any bug. Written before the verdicts."),
  timeComplexity: z.string().regex(/^O\(.+\)$/).max(40),
  spaceComplexity: z.string().regex(/^O\(.+\)$/).max(40),
  timeVerdict: z.enum(COMPLEXITY_VERDICTS),
  spaceVerdict: z.enum(COMPLEXITY_VERDICTS),
  correctness: z.enum(CORRECTNESS),
  edgeCases: z.array(z.string().min(5).max(160)).max(4).describe("Inputs this code mishandles. [] when none."),
  strengths: z.array(z.string().min(5).max(160)).max(3),
  improvements: z
    .array(z.string().min(5).max(220))
    .min(1)
    .max(4)
    .describe("Concrete and actionable, most valuable first."),
});
export type CodeReview = z.infer<typeof CodeReviewSchema>;

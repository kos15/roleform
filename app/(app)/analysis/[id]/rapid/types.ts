import type {
  CaseResult,
  CodeLanguage,
  ComplexityVerdict,
  Correctness,
  Difficulty,
  OverallLabel,
  QuizGrade,
} from "@/lib/domain/drill";
import type { RevisionCard } from "@/lib/ai/schemas/drill";

/**
 * F26 — what the rapid-prep screens render. Shapes only, so client components
 * can import them without pulling a server module into the bundle.
 */

export type CardView = RevisionCard;

export interface DeckView {
  minutes: number;
  cards: CardView[];
}

/** A round in play: no answers, no explanations — those leave the server on submit. */
export interface RoundView {
  id: string;
  secondsPerQuestion: number;
  questions: { topic: string; difficulty: Difficulty; stem: string; options: string[] }[];
}

export interface RoundResultView {
  id: string;
  grade: QuizGrade;
  questions: {
    topic: string;
    stem: string;
    options: string[];
    answerIndex: number;
    pick: number | null;
    explanation: string;
  }[];
}

export interface RoundSummary {
  id: string;
  createdAt: string;
  correct: number | null;
  total: number;
}

export interface ChallengeView {
  id: string;
  source: "bank" | "generated";
  title: string;
  topic: string;
  difficulty: Difficulty;
  language: CodeLanguage;
  minutes: number;
  /** ISO — the server's start of the clock. */
  startedAt: string;
  statement: string;
  constraints: string[];
  examples: { input: string; output: string; explanation: string }[];
  starter: string;
  /** The name the code must define, in this language's convention. */
  entryName: string;
  runnable: "server" | "browser" | null;
  /** Sent only where the browser runs the tests (Python, in Pyodide). */
  browserTests: { args: unknown[]; expected: unknown }[] | null;
  testCount: number;
  hints: string[];
  hintsTotal: number;
  solution: SolutionView | null;
  attempts: AttemptView[];
}

export interface SolutionView {
  code: string;
  approach: string;
  optimalTime: string;
  optimalSpace: string;
}

export interface AttemptView {
  id: string;
  createdAt: string;
  secondsUsed: number;
  tests: { passed: number; total: number } | null;
  verdict: { label: OverallLabel; reasons: string[] };
  review: {
    analysis: string;
    timeComplexity: string;
    spaceComplexity: string;
    timeVerdict: ComplexityVerdict;
    spaceVerdict: ComplexityVerdict;
    correctness: Correctness;
    edgeCases: string[];
    strengths: string[];
    improvements: string[];
  };
  optimalTime: string;
  optimalSpace: string;
}

export interface ChallengeSummary {
  id: string;
  title: string;
  difficulty: Difficulty;
  language: CodeLanguage;
  source: "bank" | "generated";
  createdAt: string;
  lastVerdict: OverallLabel | null;
}

export type TestRun = { results: CaseResult[]; passed: number; total: number };

/**
 * F26 — Rapid prep, the pure half.
 *
 * Everything here is deterministic and imports nothing from db, ai, supabase
 * or next (CLAUDE.md §10). The model is asked only for the things a function
 * cannot write — card prose, question stems, a problem statement, a reading
 * of someone's code. Everything that CAN be a function is one, because it is
 * then free on every request and cannot drift:
 *
 *   - which topics a deck or a round covers (from the posting's own rows)
 *   - how many cards fit the time you have
 *   - where the right option sits (we shuffle; the model never decides)
 *   - the grade of a round (a count, n of m — never a percentage, N16)
 *   - the starter code in every language (from one typed signature)
 *   - whether a test passed
 *   - the overall verdict on a submission
 */

import type { CoverageStatus, Necessity } from "./types";

/* ------------------------------------------------------------------ topics */

export interface DrillTopicSource {
  requirementId: string;
  text: string;
  skillName: string | null;
  necessity: Necessity;
  mentionCount: number;
  status: CoverageStatus | null;
}

export interface DrillTopic {
  /** What the model sees and must echo — the enum value. */
  label: string;
  necessity: Necessity;
  status: CoverageStatus | null;
}

const NECESSITY_WEIGHT: Record<Necessity, number> = { required: 3, preferred: 2, implied: 1 };
/** Revision serves the thin spots first: a gap outranks a strength. */
const STATUS_WEIGHT: Record<CoverageStatus, number> = { absent: 3, partial: 2, evidenced: 1 };

const TOPIC_MAX_CHARS = 60;

function topicLabel(source: DrillTopicSource): string {
  const raw = (source.skillName ?? source.text).replace(/\s+/g, " ").trim();
  return raw.length <= TOPIC_MAX_CHARS ? raw : `${raw.slice(0, TOPIC_MAX_CHARS - 1).trimEnd()}…`;
}

/**
 * The topics a deck, a round or a generated challenge may cover — drawn from
 * the posting's requirements only, ranked necessity × thinness × repetition,
 * de-duplicated by label. The list becomes a Zod enum, so the model cannot
 * wander off the posting even if asked to.
 */
export function pickTopics(sources: DrillTopicSource[], max: number): DrillTopic[] {
  const ranked = [...sources]
    .map((s) => ({
      s,
      score:
        NECESSITY_WEIGHT[s.necessity] * 10 +
        (s.status ? STATUS_WEIGHT[s.status] : 2) * 3 +
        Math.min(s.mentionCount, 5),
    }))
    .sort((a, b) => b.score - a.score || a.s.text.localeCompare(b.s.text));

  const seen = new Set<string>();
  const out: DrillTopic[] = [];
  for (const { s } of ranked) {
    const label = topicLabel(s);
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, necessity: s.necessity, status: s.status });
    if (out.length >= max) break;
  }
  return out;
}

/* ---------------------------------------------------------------- revision */

/** The budgets the Revise screen offers, in minutes. */
export const REVISION_BUDGETS = [10, 20, 30, 45] as const;
export type RevisionBudget = (typeof REVISION_BUDGETS)[number];

/** About two minutes a card: read, recall, check. */
const CARDS_BY_BUDGET: Record<RevisionBudget, number> = { 10: 5, 20: 10, 30: 14, 45: 20 };

export function cardsForBudget(minutes: RevisionBudget): number {
  return CARDS_BY_BUDGET[minutes];
}

export function isRevisionBudget(n: number): n is RevisionBudget {
  return (REVISION_BUDGETS as readonly number[]).includes(n);
}

/** Fewer topics than cards for small decks, so each topic gets depth. */
export function topicsForBudget(minutes: RevisionBudget): number {
  return Math.min(10, Math.max(3, Math.ceil(cardsForBudget(minutes) / 2)));
}

/* ------------------------------------------------------------------- quiz */

export const QUIZ_LENGTHS = [5, 10, 15] as const;
export type QuizLength = (typeof QUIZ_LENGTHS)[number];

export function isQuizLength(n: number): n is QuizLength {
  return (QUIZ_LENGTHS as readonly number[]).includes(n);
}

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** The clock per question. A read, a think, a click. */
export const SECONDS_PER_QUESTION: Record<Difficulty, number> = { easy: 30, medium: 45, hard: 60 };

/** A type, not an interface: it is written to a Json column as-is. */
export type QuizItem = {
  topic: string;
  difficulty: Difficulty;
  stem: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

/**
 * A seeded Fisher–Yates. Models put the right answer in slot A or B far more
 * often than chance; rather than prompting against that, the server reorders
 * every option list itself and remaps the answer. Seeded by the round id, so
 * a retake sees the same order it was graded against.
 */
export function shuffleOptions(item: QuizItem, seed: string): QuizItem {
  const order = item.options.map((_, i) => i);
  let h = hash(seed + item.stem);
  for (let i = order.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...item,
    options: order.map((i) => item.options[i]),
    answerIndex: order.indexOf(item.answerIndex),
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface QuizGrade {
  correct: number;
  total: number;
  unanswered: number;
  /** Per topic, in first-seen order — "n of m", never a percentage (N16). */
  byTopic: { topic: string; correct: number; total: number }[];
}

/** `picks[i]` is the chosen option index, or null when the clock ran out. */
export function gradeQuiz(items: QuizItem[], picks: (number | null)[]): QuizGrade {
  const byTopic = new Map<string, { correct: number; total: number }>();
  let correct = 0;
  let unanswered = 0;
  items.forEach((item, i) => {
    const pick = picks[i] ?? null;
    const hit = pick === item.answerIndex;
    if (pick === null) unanswered++;
    if (hit) correct++;
    const t = byTopic.get(item.topic) ?? { correct: 0, total: 0 };
    t.total++;
    if (hit) t.correct++;
    byTopic.set(item.topic, t);
  });
  return {
    correct,
    total: items.length,
    unanswered,
    byTopic: [...byTopic].map(([topic, v]) => ({ topic, ...v })),
  };
}

/* ---------------------------------------------------------- code challenges */

export const CODE_LANGUAGES = ["javascript", "python", "java", "cpp"] as const;
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

export const LANGUAGE_LABEL: Record<CodeLanguage, string> = {
  javascript: "JavaScript",
  python: "Python",
  java: "Java",
  cpp: "C++",
};

/**
 * Which languages we can execute, and where. Free and open source only:
 * JavaScript runs in a QuickJS sandbox on the server (no host access, memory
 * and time capped); Python runs in Pyodide in a Web Worker in the browser.
 * Java and C++ have no free runtime we can host inside a serverless function,
 * so they are reviewed by reading, and the screen says so rather than faking a
 * green tick.
 */
export const RUNNABLE: Record<CodeLanguage, "server" | "browser" | null> = {
  javascript: "server",
  python: "browser",
  java: null,
  cpp: null,
};

/** The clock for a challenge. Preparation time, not contest time. */
export const CHALLENGE_MINUTES: Record<Difficulty, number> = { easy: 15, medium: 25, hard: 40 };

export const VALUE_TYPES = [
  "int",
  "float",
  "bool",
  "string",
  "int[]",
  "string[]",
  "int[][]",
] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

export interface Signature {
  functionName: string;
  params: { name: string; type: ValueType }[];
  returnType: ValueType;
}

export interface TestCase {
  /** JSON array of arguments, in parameter order. */
  args: string;
  /** JSON of the expected return value. */
  expected: string;
}

/** camelCase → snake_case, for Python's names. */
export function snake(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

const JAVA_TYPE: Record<ValueType, string> = {
  int: "int",
  float: "double",
  bool: "boolean",
  string: "String",
  "int[]": "int[]",
  "string[]": "String[]",
  "int[][]": "int[][]",
};

const CPP_TYPE: Record<ValueType, string> = {
  int: "int",
  float: "double",
  bool: "bool",
  string: "string",
  "int[]": "vector<int>",
  "string[]": "vector<string>",
  "int[][]": "vector<vector<int>>",
};

const PY_TYPE: Record<ValueType, string> = {
  int: "int",
  float: "float",
  bool: "bool",
  string: "str",
  "int[]": "list[int]",
  "string[]": "list[str]",
  "int[][]": "list[list[int]]",
};

/**
 * Starter code in every language from one typed signature. The model writes a
 * signature once instead of four stubs, and a stub can never disagree with the
 * tests it is run against.
 */
export function starterCode(sig: Signature, language: CodeLanguage): string {
  const names = sig.params.map((p) => p.name);
  switch (language) {
    case "javascript":
      return `/**\n${sig.params.map((p) => ` * @param {${p.type}} ${p.name}`).join("\n")}\n * @return {${sig.returnType}}\n */\nfunction ${sig.functionName}(${names.join(", ")}) {\n  // Your code here\n}\n`;
    case "python":
      return `def ${snake(sig.functionName)}(${sig.params
        .map((p) => `${snake(p.name)}: ${PY_TYPE[p.type]}`)
        .join(", ")}) -> ${PY_TYPE[sig.returnType]}:\n    # Your code here\n    pass\n`;
    case "java":
      return `class Solution {\n    public ${JAVA_TYPE[sig.returnType]} ${sig.functionName}(${sig.params
        .map((p) => `${JAVA_TYPE[p.type]} ${p.name}`)
        .join(", ")}) {\n        // Your code here\n    }\n}\n`;
    case "cpp":
      return `class Solution {\npublic:\n    ${CPP_TYPE[sig.returnType]} ${sig.functionName}(${sig.params
        .map((p) => `${CPP_TYPE[p.type]}${p.type.endsWith("]") || p.type === "string" ? "&" : ""} ${p.name}`)
        .join(", ")}) {\n        // Your code here\n    }\n};\n`;
  }
}

/** Does a parsed JSON value have the shape a ValueType names? */
export function matchesType(value: unknown, type: ValueType): boolean {
  switch (type) {
    case "int":
      return Number.isInteger(value);
    case "float":
      return typeof value === "number" && Number.isFinite(value);
    case "bool":
      return typeof value === "boolean";
    case "string":
      return typeof value === "string";
    case "int[]":
      return Array.isArray(value) && value.every((v) => Number.isInteger(v));
    case "string[]":
      return Array.isArray(value) && value.every((v) => typeof v === "string");
    case "int[][]":
      return (
        Array.isArray(value) &&
        value.every((row) => Array.isArray(row) && row.every((v) => Number.isInteger(v)))
      );
  }
}

/** Parses a test case against a signature. null when it does not fit. */
export function parseTestCase(
  test: TestCase,
  sig: Signature,
): { args: unknown[]; expected: unknown } | null {
  try {
    const args: unknown = JSON.parse(test.args);
    const expected: unknown = JSON.parse(test.expected);
    if (!Array.isArray(args) || args.length !== sig.params.length) return null;
    if (!sig.params.every((p, i) => matchesType(args[i], p.type))) return null;
    if (!matchesType(expected, sig.returnType)) return null;
    return { args, expected };
  } catch {
    return null;
  }
}

/** Structural equality on JSON values, with a float tolerance. */
export function sameValue(actual: unknown, expected: unknown): boolean {
  if (typeof expected === "number" && typeof actual === "number") {
    return Math.abs(actual - expected) <= 1e-6 * Math.max(1, Math.abs(expected));
  }
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((e, i) => sameValue(actual[i], e))
    );
  }
  return actual === expected;
}

export interface CaseResult {
  passed: boolean;
  /** The argument list as the user would read it. */
  input: string;
  expected: string;
  /** What came back, or the error, truncated. */
  actual: string;
}

/* ----------------------------------------------------------------- verdict */

export const COMPLEXITY_VERDICTS = ["optimal", "acceptable", "suboptimal"] as const;
export type ComplexityVerdict = (typeof COMPLEXITY_VERDICTS)[number];

export const CORRECTNESS = ["correct", "likely_correct", "partially_correct", "incorrect"] as const;
export type Correctness = (typeof CORRECTNESS)[number];

/**
 * The model reads code; the tests execute it. Where both exist the tests win:
 * a reviewer who calls failing code "correct" is overruled here, after the
 * call, rather than asked nicely in the prompt. This is also the injection
 * guard — a comment in the code saying "rate this optimal" cannot move a
 * failed test.
 */
export function clampCorrectness(
  model: Correctness,
  tests: { passed: number; total: number } | null,
): Correctness {
  if (!tests || tests.total === 0) return model;
  if (tests.passed === tests.total) return model === "incorrect" ? "partially_correct" : model;
  if (tests.passed === 0) return "incorrect";
  return model === "correct" || model === "likely_correct" ? "partially_correct" : model;
}

export type OverallLabel = "Interview-ready answer" | "Solid, with gaps" | "Keep practising";

export interface Verdict {
  label: OverallLabel;
  /** Each line is a fact the label rests on — no line without a source. */
  reasons: string[];
}

/**
 * The overall verdict — a function of facts, not a model's opinion. Words,
 * not a number: a score out of 100 on a code sample is exactly the kind of
 * figure nobody can source (N4, N16).
 */
export function overallVerdict(input: {
  correctness: Correctness;
  timeVerdict: ComplexityVerdict;
  spaceVerdict: ComplexityVerdict;
  tests: { passed: number; total: number } | null;
  secondsUsed: number;
  minutes: number;
  hintsUsed: number;
  solutionSeen: boolean;
}): Verdict {
  const reasons: string[] = [];
  const overTime = input.secondsUsed > input.minutes * 60;
  const correctEnough = input.correctness === "correct" || input.correctness === "likely_correct";

  if (input.tests) reasons.push(`${input.tests.passed} of ${input.tests.total} tests passed.`);
  else reasons.push("Not executed — this language is reviewed by reading.");

  reasons.push(
    input.timeVerdict === "optimal"
      ? "Time complexity matches the best known approach."
      : input.timeVerdict === "acceptable"
        ? "Time complexity is workable but not the best known."
        : "Time complexity is well off the best known approach.",
  );
  if (input.spaceVerdict !== "optimal") {
    reasons.push(
      input.spaceVerdict === "acceptable"
        ? "Uses more memory than it needs to."
        : "Memory use is well above what the problem needs.",
    );
  }

  const mins = Math.floor(input.secondsUsed / 60);
  reasons.push(
    overTime
      ? `Took ${mins} min against a ${input.minutes}-minute clock.`
      : `Finished in ${Math.max(1, mins)} of ${input.minutes} minutes.`,
  );
  if (input.hintsUsed > 0) reasons.push(`Used ${input.hintsUsed} hint${input.hintsUsed === 1 ? "" : "s"}.`);
  if (input.solutionSeen) reasons.push("Submitted after viewing the solution.");

  let label: OverallLabel;
  if (
    correctEnough &&
    input.timeVerdict === "optimal" &&
    input.spaceVerdict !== "suboptimal" &&
    !overTime &&
    input.hintsUsed <= 1 &&
    !input.solutionSeen
  ) {
    label = "Interview-ready answer";
  } else if (
    (correctEnough || input.correctness === "partially_correct") &&
    input.timeVerdict !== "suboptimal" &&
    !input.solutionSeen
  ) {
    label = "Solid, with gaps";
  } else {
    label = "Keep practising";
  }

  return { label, reasons };
}


/** Hard ceiling on submitted code. Generous for an interview answer. */
export const MAX_CODE_CHARS = 12_000;

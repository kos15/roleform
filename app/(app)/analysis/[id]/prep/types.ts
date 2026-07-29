/**
 * View shapes for the Prep tab.
 *
 * Kept out of the server action so the client component can import them without
 * pulling a "use server" module's runtime into the bundle, and out of
 * lib/domain because these describe a screen, not the product's rules.
 */

export type QuestionType =
  | "behavioral"
  | "technical"
  | "situational"
  | "gap"
  | "culture"
  | "system_design";

export interface QuestionView {
  id: string;
  type: QuestionType;
  text: string;
  likely: boolean;
  whyTheyAsk: string;
  frame: string[];
  /** Resolved bullet text. N2 guarantees this is non-empty unless type is 'gap'. */
  evidence: string[];
}

/** One place the candidate's own experience enters the answer, and its source. */
export interface HookView {
  useIt: string;
  /** The profile bullet this derives from, verbatim. Empty only if since deleted. */
  sourceText: string;
}

export interface CourseView {
  id: string;
  title: string;
  provider: string;
  url: string;
  mark: string;
  priceLabel: string;
  isFree: boolean;
}

export interface AnswerView {
  headline: string;
  sections: Array<{ heading: string; body: string }>;
  resumeHooks: HookView[];
  followUps: string[];
  keyConcepts: string[];
  /** Curated catalog only (N8). Empty is the honest answer, not a failure. */
  courses: CourseView[];
}

/**
 * Versioned prompt templates.
 *
 * The schema is the contract; these are documentation for the model (specs §10).
 * A text change bumps the version here so `ai_runs.prompt_version` stays a
 * usable axis when a failure rate moves.
 *
 * ── Rules every prompt here follows (rules.md PR-1/PR-2/PR-8/PR-9) ───────────
 *   - One home per instruction: field shape lives in a schema's `.describe()`,
 *     behaviour lives here, enforcement lives in a validator.
 *   - A line survives only if it changes a first-attempt output.
 *   - Static text only. Everything variable arrives in the user message, so
 *     every call shares a cacheable prefix.
 *
 * ── v3: output discipline (F27) ──────────────────────────────────────────────
 * Each prompt is now built the same way, in this order:
 *
 *   1. Task — one line: what to produce, for whom.
 *   2. Rules — the decisions the model must make, as testable statements.
 *   3. Length — a word budget per prose field. These are not style notes: the
 *      schemas carry character ceilings, and a field that overruns one fails
 *      validation and costs a corrective retry. Stating the budget in words is
 *      what makes the first attempt land inside it (PR-2), and it is the main
 *      output-token cut of v3.
 *   4. Self-check — one line naming the failure the validator would catch, so
 *      the model checks for it before it is billed for a retry.
 *
 * `STYLE` is shared by every call whose output a person reads as prose. It
 * bans the filler, buzzwords and preamble that inflated v2 outputs without
 * adding a fact. Extraction and OCR do not get it: they transcribe, and a
 * style rule there would be an invitation to rewrite.
 *
 * `SYSTEM_V2` (archive/v2.ts) is the text this replaced, kept for one release
 * (PR-6) so a token-delta comparison or a revert has the exact prior wording
 * on hand. Nothing in the app imports it.
 *
 * ── Layout ───────────────────────────────────────────────────────────────────
 * One file per prompt, named for its SYSTEM key; `shared.ts` holds LAW and
 * STYLE; `versions.ts` holds PROMPT_VERSIONS. tests/ai/system-prompts.test.ts
 * pins every prompt byte for byte.
 */

import { extractProfile } from "./extract-profile";
import { transcribeDocument } from "./transcribe-document";
import { analyzeJd } from "./analyze-jd";
import { tailorBullets } from "./tailor-bullets";
import { tailorSummary } from "./tailor-summary";
import { generateQuestions } from "./generate-questions";
import { answerQuestion } from "./answer-question";
import { synthesisePlan } from "./synthesise-plan";
import { revisionCards } from "./revision-cards";
import { quizRound } from "./quiz-round";
import { codingChallenge } from "./coding-challenge";
import { codeReview } from "./code-review";

export { PROMPT_VERSIONS } from "./versions";

export const SYSTEM = {
  extractProfile,
  transcribeDocument,
  analyzeJd,
  tailorBullets,
  tailorSummary,
  generateQuestions,
  answerQuestion,
  synthesisePlan,
  revisionCards,
  quizRound,
  codingChallenge,
  codeReview,
} as const;

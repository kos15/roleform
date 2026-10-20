import "server-only";
import { quizRoundSchema } from "../schemas/drill";
import { PROMPT_VERSIONS, SYSTEM } from "../prompts";
import { SECONDS_PER_QUESTION, type Difficulty, type DrillTopic } from "@/lib/domain/drill";
import { defineAgent } from "./define";
import { enumOf, roleLine, topicBlock, type DrillRole } from "./drill-prompt";

export interface QuizWriterInput {
  role: DrillRole;
  topics: DrillTopic[];
  count: number;
  difficulty: Difficulty;
}

const BANNED_OPTION = /\b(all|none|both) of the above\b|\bboth [a-d] and [a-d]\b/i;

/** QuizWriter — a timed multiple-choice round over the posting's topics (F26). */
export const quizWriter = defineAgent({
  name: "quiz_round",
  promptVersion: PROMPT_VERSIONS.quizRound,
  model: "writer-fast",
  schema: (i: QuizWriterInput) => quizRoundSchema(enumOf(i.topics), i.count),
  system: SYSTEM.quizRound,
  staticContext: (i) => roleLine(i.role),
  dynamicContext: (i) =>
    [
      `Write exactly ${i.count} questions, mostly ${i.difficulty}. Time limit: ${SECONDS_PER_QUESTION[i.difficulty]} seconds each.`,
      topicBlock(i.topics),
    ].join("\n"),
  reasoningEffort: "low",
  maxOutputTokens: (i) => (300 + i.count * 190) * 2,
  retries: 1,
  inputGuards: [],
  outputGuards: ["no_urls", "tone_prep"],
  verify: (value) => {
    for (const [n, q] of value.questions.entries()) {
      const norm = q.options.map((o) => o.toLowerCase().replace(/\s+/g, " ").trim());
      if (new Set(norm).size !== 4) return `Question ${n + 1} repeats an option. Four distinct options each.`;
      if (q.options.some((o) => BANNED_OPTION.test(o))) {
        return `Question ${n + 1} uses an "all/none of the above" option. Replace it with a real distractor.`;
      }
    }
    const stems = value.questions.map((q) => q.stem.toLowerCase().trim());
    if (new Set(stems).size !== stems.length) return "Two questions are identical. Every question must be distinct.";
    return null;
  },
});

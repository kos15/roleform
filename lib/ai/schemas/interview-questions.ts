import { z } from "zod";

/**
 * Interview question contract (F7, N2).
 *
 * The DB CHECK is the real guard: a non-gap question with empty evidence is
 * rejected by Postgres. The schema states the same rule so the model has a
 * chance to obey it, and so a violation shows up as a schema failure in
 * `ai_runs` rather than a silent 500.
 *
 * `frame` is scaffolding, not a script. For a gap question it coaches honest
 * positioning — what to lean on instead, what you're doing about it — and
 * never a credential the user cannot claim (CLAUDE.md §3).
 *
 * `system_design` is a first-class type rather than a flavour of `technical`.
 * The Prep tab surfaces the two separately, and a role that never designs a
 * system should honestly produce none of them — the count is not padded to
 * fill a tab.
 */

export const InterviewQuestionSchema = z.object({
  type: z.enum(["behavioral", "technical", "situational", "gap", "culture", "system_design"]),
  text: z
    .string()
    .min(10)
    .describe("A question this posting would plausibly produce. Never a generic stock question."),
  likely: z.boolean().describe("True for the four most probable, given the posting's emphasis."),
  whyTheyAsk: z
    .string()
    .min(10)
    .max(240)
    .describe("Tie this to something the posting actually says."),
  frame: z
    .array(z.string().min(5))
    .length(3)
    .describe("Three points of scaffolding for the answer. Not a script, not a claim."),
  evidenceBulletIds: z
    .array(z.string())
    .describe(
      "Ids of the profile bullets the answer should pull from. " +
        "MUST be non-empty unless type is 'gap'. Only ids you were given.",
    ),
  sourceRequirementText: z
    .string()
    .describe("The requirement this probes, or empty string."),
});

export const InterviewQuestionsSchema = z.object({
  questions: z
    .array(InterviewQuestionSchema)
    .length(12)
    .describe("Exactly twelve, ordered most to least likely. Exactly four have likely = true."),
});

export type InterviewQuestionOut = z.infer<typeof InterviewQuestionSchema>;

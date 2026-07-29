import { z } from "zod";

/**
 * Worked answer contract (F7.2).
 *
 * The Prep tab's frameworks are scaffolding by design. This is the other half:
 * a complete answer the user can read end to end, for the two families where a
 * three-point frame is genuinely not enough — `technical` and `system_design`.
 *
 * The fabrication boundary (CLAUDE.md §3) is enforced by SPLITTING the answer,
 * not by asking the model to be careful:
 *
 *   `sections`    — the domain answer. General technical knowledge about the
 *                   subject. Says nothing about the candidate, so there is
 *                   nothing here to fabricate about them.
 *   `resumeHooks` — the only first-person material. Every hook names the
 *                   `experience_bullet` it derives from; a hook citing an id we
 *                   did not supply is dropped, the same shape as N1.
 *
 * That split is why a lightweight model is the right call here: the expensive
 * judgement (what the candidate can evidence) already happened upstream in
 * coverage and question generation. This step writes prose over a decided set
 * of facts.
 *
 * Every property is required — OpenAI strict mode rejects a schema whose
 * `required` array omits a key in `properties`. Absence is a value ([], ""),
 * never an omitted key. See lib/ai/schemas/resume-json.ts.
 */

export const AnswerSectionSchema = z.object({
  heading: z
    .string()
    .min(3)
    .max(64)
    .describe("A short label for this beat of the answer. Not a full sentence."),
  body: z
    .string()
    .min(60)
    .max(1200)
    .describe(
      "Two to five sentences of substance. Written to be spoken aloud, not read off a slide. " +
        "Concrete: name the actual mechanism, trade-off or failure mode. No filler, no restating the question.",
    ),
});

export const ResumeHookSchema = z.object({
  bulletId: z
    .string()
    .describe("The id of the profile bullet this hook draws on. Only ids you were given."),
  useIt: z
    .string()
    .min(30)
    .max(400)
    .describe(
      "How to bring that bullet into this answer, in the candidate's own voice. " +
        "Restates only what the bullet already claims — no new metric, tool, scale or seniority.",
    ),
});

export const QuestionAnswerSchema = z.object({
  headline: z
    .string()
    .min(20)
    .max(220)
    .describe("The one sentence to lead with. The answer in miniature."),
  sections: z
    .array(AnswerSectionSchema)
    .min(3)
    .max(5)
    .describe("The worked answer, in order of delivery. Three to five beats."),
  resumeHooks: z
    .array(ResumeHookSchema)
    .describe(
      "Where the candidate's own experience plugs in. Empty array is correct for a gap " +
        "question, and for any question their profile genuinely cannot speak to.",
    ),
  followUps: z
    .array(z.string().min(10).max(200))
    .length(3)
    .describe("Three follow-ups an interviewer would realistically push into after this answer."),
  keyConcepts: z
    .array(z.string().min(2).max(48))
    .min(2)
    .max(6)
    .describe(
      "The named concepts this answer rests on. Plain names only — never a URL, never a course " +
        "title. Links come from the curated catalog (N8).",
    ),
});

export type QuestionAnswerOut = z.infer<typeof QuestionAnswerSchema>;
export type AnswerSection = z.infer<typeof AnswerSectionSchema>;
export type ResumeHook = z.infer<typeof ResumeHookSchema>;

/**
 * The same schema is the read guard. `sections` and `resumeHooks` are Json
 * columns, so the row is only as trustworthy as what parses back out of it —
 * validating on the way in and again on the way out is what makes a Json column
 * acceptable under the light-testing policy (§11).
 */
export const StoredSectionsSchema = z.array(AnswerSectionSchema);
export const StoredHooksSchema = z.array(ResumeHookSchema);

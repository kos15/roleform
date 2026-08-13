import { z } from "zod";

/**
 * S6 — the plan synthesiser's contract. The ONLY large-model call in the
 * learning engine, and the only stage whose output a user reads as prose.
 *
 * ── What this schema does NOT contain, and why ──────────────────────────────
 * No URL. No provider name. No title. No duration. No ordering field.
 *
 * Every one of those is already decided and already stored, and the serialiser
 * reads them from the database. guardrails.md OUT-1: "a model cannot invent a
 * link it was never asked to write." The cheapest way to guarantee that is to
 * give the schema nowhere to put one.
 *
 * The model returns resource IDs and sentences. That is the whole surface area,
 * and it is what bounds the blast radius of a prompt injection carried in a job
 * description (IN-5) to text that OUT-2, OUT-4 and OUT-6 then check.
 *
 * ── Everything here is framing, never deciding ──────────────────────────────
 * The gaps arrived ranked (lib/domain/severity.ts), the resources arrived
 * selected (lib/domain/selection.ts), the sequence arrived solved
 * (lib/domain/plan.ts). Re-ranking, re-selecting, adding or dropping is a
 * schema violation caught in `verify`, not a style note in the prompt.
 */

export const PlanResourceNoteSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe("Echo the resource id you were given, exactly. Never invent one."),
  note: z
    .string()
    .min(10)
    .max(200)
    .describe(
      "One sentence on why THIS entry point, given what they already know. " +
        "Use the provided summary. Never describe content you were not given.",
    ),
});

export const PlanGapSchema = z.object({
  skillName: z.string().min(1).describe("Echo the skill name you were given, exactly."),
  jdQuote: z
    .string()
    .min(8)
    .max(300)
    .describe(
      "A verbatim span of the posting text you were given for this gap. " +
        "Copy it; do not paraphrase it. It is checked against the stored requirement.",
    ),
  whyItMatters: z
    .string()
    .min(20)
    .max(240)
    .describe(
      "One sentence connecting the skill to what this role does day to day, " +
        "grounded in jdQuote. Never invent a requirement the posting didn't make.",
    ),
  unlocksBulletDraft: z
    .string()
    .min(20)
    .max(320)
    .describe(
      "How the candidate's EXISTING bullet could be truthfully rewritten AFTER " +
        "completing the resources. Phrase it prospectively — 'once you've built " +
        "this, that bullet becomes…'. Never as something they can claim today. " +
        "Reuse their own vocabulary. Empty string if you were given no bullet.",
    ),
  resources: z.array(PlanResourceNoteSchema).max(3),
});

export const LearningPlanSchema = z.object({
  opening: z
    .string()
    .min(30)
    .max(400)
    .describe(
      "Two sentences. Lead with what already matches the role, then frame the " +
        "gaps as the specific work between them and readiness.",
    ),
  sequenceNote: z
    .string()
    .min(15)
    .max(240)
    .describe("One sentence on why the order is what it is. The order is given; explain it."),
  gaps: z.array(PlanGapSchema).max(7),
});

export type LearningPlanOut = z.infer<typeof LearningPlanSchema>;
export type PlanGapOut = z.infer<typeof PlanGapSchema>;

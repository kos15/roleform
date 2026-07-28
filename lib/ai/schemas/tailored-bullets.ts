import { z } from "zod";

/**
 * Tailoring contract.
 *
 * The call is scoped to ONE bullet and ONE target requirement (specs §10) —
 * never the full profile alongside the JD. That scoping is what measurably
 * stops experience from one role bleeding into another, and no prompt wording
 * substitutes for it.
 *
 * `sourceBulletId` is echoed back so the verification layer can reject an
 * invented id before it ever reaches the NOT NULL foreign key (N1).
 */

export const TailoredBulletSchema = z.object({
  sourceBulletId: z
    .string()
    .describe("Echo the id you were given, exactly. Do not invent or alter it."),
  rewrittenText: z
    .string()
    .min(10)
    .describe(
      "The same claim in the posting's vocabulary. No new numbers, tools, or seniority. " +
        "If nothing should change, return the original text unchanged.",
    ),
  transform: z
    .enum(["verbatim", "rephrase", "requantify", "omit"])
    .describe(
      "verbatim = unchanged; rephrase = same claim, their words; " +
        "requantify = reframed using a number already on the source bullet; " +
        "omit = not relevant to this posting, leave it out of this draft.",
    ),
  rationale: z.string().max(160).describe("One line: why this wording serves this posting."),
});

export const TailoredBulletsSchema = z.object({
  bullets: z.array(TailoredBulletSchema).min(1),
});

export type TailoredBulletOut = z.infer<typeof TailoredBulletSchema>;

/** The tailored summary line shown on the Resumes tab (F5). */
export const TailorSummarySchema = z.object({
  summary: z
    .string()
    .min(20)
    .max(240)
    .describe("One line stating what changed across all drafts. Plain, not promotional."),
  professionalSummary: z
    .string()
    .max(420)
    .describe(
      "A résumé summary assembled ONLY from claims already present in the bullets provided. " +
        "No new employers, tools, metrics or titles.",
    ),
});

import { z } from "zod";

/**
 * Gap notes (F8).
 *
 * The model writes the *note* only. Which skills are gaps comes from the pure
 * coverage pass, the ordering comes from mention_count, and the courses come
 * from the curated catalog (N8) via deterministic matching. The LLM never
 * chooses what the user is missing and never produces a URL.
 */

export const SkillGapSchema = z.object({
  skillName: z.string().min(1).describe("Echo the skill name you were given, exactly."),
  userLevel: z
    .enum(["none", "exposure", "working", "strong"])
    .describe("Judged only from the profile bullets provided. 'none' when nothing supports it."),
  requiredLevel: z
    .enum(["exposure", "working", "strong", "expert"])
    .describe("Judged only from the posting's own wording."),
  note: z
    .string()
    .min(10)
    .max(220)
    .describe(
      "One honest line on the distance and the nearest thing the user does have. " +
        "Never suggests claiming the skill.",
    ),
});

export const SkillGapsSchema = z.object({
  gaps: z.array(SkillGapSchema),
});

export type SkillGapOut = z.infer<typeof SkillGapSchema>;

import { z } from "zod";

/**
 * JD analysis contract. The schema IS the contract; the prompt is documentation
 * for the model (specs §10).
 *
 * `evidenceQuote` is required and must be a span from the posting — it is what
 * lets the results screen show *why* we think this is a requirement, and it
 * makes an invented requirement much harder for a model to produce.
 */

export const JdMetaSchema = z.object({
  company: z.string().describe("Empty string if the posting does not say."),
  title: z.string(),
  location: z.string(),
  seniority: z.enum(["intern", "junior", "mid", "senior", "staff", "lead", "director", "unstated"]),
  employmentType: z.enum(["full-time", "part-time", "contract", "internship", "unstated"]),
  language: z.enum(["en", "other"]).describe("v1 is English only; 'other' stops the pipeline."),
  isJobPosting: z
    .boolean()
    .describe("False if this document is not a job posting. We say so rather than produce nonsense."),
});

export const RequirementSchema = z.object({
  kind: z.enum([
    "hard_skill",
    "soft_skill",
    "experience",
    "education",
    "certification",
    "responsibility",
  ]),
  text: z.string().min(3).describe("The requirement in the posting's own terms, one clause."),
  necessity: z
    .enum(["required", "preferred", "implied"])
    .describe("required = stated as must-have; preferred = nice-to-have; implied = inferable from responsibilities"),
  skillName: z
    .string()
    .describe("Canonical skill name if this maps to one, else empty string. Never invent a skill."),
  mentionCount: z
    .number()
    .int()
    .min(1)
    .describe("How many times the posting refers to this, counting synonyms."),
  evidenceQuote: z
    .string()
    .min(3)
    .describe("A verbatim span from the posting. Must appear in the input text."),
});

export const JdAnalysisSchema = z.object({
  meta: JdMetaSchema,
  requirements: z
    .array(RequirementSchema)
    .min(1)
    .max(30)
    .describe("Deduped. A typical 600-word posting yields 12–25."),
  usedRegions: z
    .array(z.string())
    .describe("Section headings you drew requirements from, so we can tell the user what was used."),
});

export type JdAnalysis = z.infer<typeof JdAnalysisSchema>;
export type JdMeta = z.infer<typeof JdMetaSchema>;
export type ParsedRequirement = z.infer<typeof RequirementSchema>;

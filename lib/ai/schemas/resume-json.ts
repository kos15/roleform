/**
 * JSON Resume schema v1.0.0 (specs §6.1), narrowed.
 *
 * Given light testing, the schema carries more weight than usual: prefer narrow
 * over permissive, enums over strings, required over optional. A schema that
 * cannot express a wrong answer is worth more than a test that catches one.
 *
 * Dates are ISO YYYY-MM (or YYYY). Ambiguous dates surface as a review prompt —
 * the schema will not accept a guessed month (F1 acceptance).
 */
import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}(-\d{2})?$/, "date must be YYYY or YYYY-MM")
  .describe("ISO date, YYYY-MM or YYYY. Never invent a month you cannot read.");

export const BasicsSchema = z.object({
  name: z.string().min(1),
  label: z.string().default(""),
  email: z.string().default(""),
  phone: z.string().default(""),
  url: z.string().default(""),
  summary: z.string().default(""),
  location: z
    .object({ city: z.string().default(""), region: z.string().default(""), countryCode: z.string().default("") })
    .default({ city: "", region: "", countryCode: "" }),
  profiles: z
    .array(z.object({ network: z.string(), username: z.string(), url: z.string() }))
    .default([]),
});

export const WorkSchema = z.object({
  name: z.string().min(1).describe("employer"),
  position: z.string().min(1),
  location: z.string().default(""),
  startDate: isoDate,
  endDate: isoDate.nullable().describe("null means current"),
  summary: z.string().default(""),
  highlights: z
    .array(z.string().min(1))
    .describe("One achievement per entry, verbatim from the document. Never merge two bullets."),
});

export const EducationSchema = z.object({
  institution: z.string().min(1),
  area: z.string().default(""),
  studyType: z.string().default(""),
  startDate: isoDate.nullable(),
  endDate: isoDate.nullable(),
  score: z.string().default(""),
  courses: z.array(z.string()).default([]),
});

export const ProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  url: z.string().default(""),
  startDate: isoDate.nullable(),
  endDate: isoDate.nullable(),
  highlights: z.array(z.string().min(1)).default([]),
});

export const SkillSchema = z.object({
  name: z.string().min(1),
  level: z.string().default(""),
  keywords: z.array(z.string()).default([]),
});

export const CertificateSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().default(""),
  date: isoDate.nullable(),
  url: z.string().default(""),
});

export const VolunteerSchema = z.object({
  organization: z.string().min(1),
  position: z.string().default(""),
  startDate: isoDate.nullable(),
  endDate: isoDate.nullable(),
  summary: z.string().default(""),
  highlights: z.array(z.string().min(1)).default([]),
});

export const ResumeJsonSchema = z.object({
  basics: BasicsSchema,
  work: z.array(WorkSchema).default([]),
  education: z.array(EducationSchema).default([]),
  skills: z.array(SkillSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  certificates: z.array(CertificateSchema).default([]),
  volunteer: z.array(VolunteerSchema).default([]),
  awards: z.array(z.object({ title: z.string(), awarder: z.string().default(""), date: isoDate.nullable() })).default([]),
  languages: z.array(z.object({ language: z.string(), fluency: z.string().default("") })).default([]),
});

export type ResumeJson = z.infer<typeof ResumeJsonSchema>;

/** Roleform's namespaced extension. Keeps the document valid and portable. */
export interface RoleformExtension {
  schemaVersion: 1;
  /** "work.0.highlights.0" → experience_bullets.id */
  bulletIds: Record<string, string>;
  sensitivity: { hidePhone: boolean; hideAddress: boolean };
}

export interface StoredResume extends ResumeJson {
  $schema?: string;
  x_roleform?: RoleformExtension;
}

/** Extraction quality signals the review screen surfaces, never silently fixes. */
export const ExtractionNoticeSchema = z.object({
  ambiguousDates: z
    .array(z.object({ path: z.string(), raw: z.string() }))
    .describe("Dates you could not read confidently. Surface, never guess."),
  careerGaps: z
    .array(z.object({ afterPath: z.string(), months: z.number().int() }))
    .describe("Gaps of 4+ months between roles. Shown neutrally at review, never concealed."),
});

export const ExtractProfileSchema = z.object({
  resume: ResumeJsonSchema,
  notices: ExtractionNoticeSchema,
});

export type ExtractProfileResult = z.infer<typeof ExtractProfileSchema>;

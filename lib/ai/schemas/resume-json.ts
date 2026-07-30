/**
 * JSON Resume schema v1.0.0 (specs §6.1), narrowed.
 *
 * Given light testing, the schema carries more weight than usual: prefer narrow
 * over permissive, enums over strings, required over optional. A schema that
 * cannot express a wrong answer is worth more than a test that catches one.
 *
 * Dates are ISO YYYY-MM (or YYYY). Ambiguous dates surface as a review prompt —
 * the schema will not accept a guessed month (F1 acceptance).
 *
 * EVERY property here is required. This is not stylistic: OpenAI's strict
 * structured-output mode rejects a schema whose `required` array omits any key
 * in `properties`, and `.default()` in Zod emits exactly that — an optional
 * property. Absence is therefore expressed in the value, never by omitting the
 * key: `""` for an unknown string, `[]` for an empty list, `null` for an
 * unreadable date. Constrained decoding then guarantees a well-formed object
 * rather than us repairing one after the fact.
 */
import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}(-\d{2})?$/, "date must be YYYY or YYYY-MM")
  .describe("ISO date, YYYY-MM or YYYY. Never invent a month you cannot read.");

/** Absent-but-required text. Empty string means "not stated in the document". */
const optionalText = z.string().describe('Empty string if the document does not state it.');

export const BasicsSchema = z.object({
  name: z.string().min(1),
  label: optionalText,
  email: optionalText,
  phone: optionalText,
  url: optionalText,
  summary: optionalText,
  location: z.object({
    city: optionalText,
    region: optionalText,
    countryCode: optionalText,
  }),
  profiles: z.array(z.object({ network: z.string(), username: z.string(), url: z.string() })),
});

export const WorkSchema = z.object({
  name: z.string().min(1).describe("employer"),
  position: z.string().min(1),
  location: optionalText,
  startDate: isoDate,
  endDate: isoDate.nullable().describe("null means current"),
  summary: optionalText,
  highlights: z
    .array(z.string().min(1))
    .describe("One achievement per entry, verbatim from the document. Never merge two bullets."),
});

export const EducationSchema = z.object({
  institution: z.string().min(1),
  area: optionalText,
  studyType: optionalText,
  startDate: isoDate.nullable(),
  endDate: isoDate.nullable(),
  score: optionalText,
  courses: z.array(z.string()),
});

export const ProjectSchema = z.object({
  name: z.string().min(1),
  description: optionalText,
  url: optionalText,
  startDate: isoDate.nullable(),
  endDate: isoDate.nullable(),
  highlights: z.array(z.string().min(1)),
});

export const SkillSchema = z.object({
  name: z.string().min(1),
  level: optionalText,
  keywords: z.array(z.string()),
});

export const CertificateSchema = z.object({
  name: z.string().min(1),
  issuer: optionalText,
  date: isoDate.nullable(),
  url: optionalText,
});

export const VolunteerSchema = z.object({
  organization: z.string().min(1),
  position: optionalText,
  startDate: isoDate.nullable(),
  endDate: isoDate.nullable(),
  summary: optionalText,
  highlights: z.array(z.string().min(1)),
});

export const ResumeJsonSchema = z.object({
  basics: BasicsSchema,
  work: z.array(WorkSchema),
  education: z.array(EducationSchema),
  skills: z.array(SkillSchema),
  projects: z.array(ProjectSchema),
  certificates: z.array(CertificateSchema),
  volunteer: z.array(VolunteerSchema),
  awards: z.array(z.object({ title: z.string(), awarder: optionalText, date: isoDate.nullable() })),
  languages: z.array(z.object({ language: z.string(), fluency: optionalText })),
});

export type ResumeJson = z.infer<typeof ResumeJsonSchema>;

/**
 * Roleform's namespaced extension. Keeps the document valid and portable.
 *
 * Everything the product needs that JSON Resume has no field for lives here
 * rather than widening `ResumeJsonSchema`: that schema is the LLM's contract
 * under strict structured output (see the note at the top of this file), and a
 * field the model has no business filling in should not appear in the shape we
 * hand it. These are user-authored (N3) and never model-written.
 */
export const RoleformExtensionSchema = z.object({
  schemaVersion: z.literal(1),
  /** "work.0.highlights.0" → experience_bullets.id */
  bulletIds: z.record(z.string(), z.string()),
  sensitivity: z.object({ hidePhone: z.boolean(), hideAddress: z.boolean() }),
  /** Skill name → years, for the profile's skill rows. JSON Resume has no field. */
  skillYears: z.record(z.string(), z.number().min(0).max(60)).optional(),
  /**
   * What the person is looking for. Recorded because they told us, and shown
   * back to them — nothing in the pipeline reads it, and the section says so
   * rather than implying a filter that doesn't exist.
   */
  preferences: z
    .object({
      targetTitles: z.string().max(200),
      workMode: z.string().max(200),
      noticePeriod: z.string().max(100),
      expectedRange: z.string().max(100),
    })
    .optional(),
});

export type RoleformExtension = z.infer<typeof RoleformExtensionSchema>;

/**
 * The document as we store it: JSON Resume plus our namespace.
 *
 * The profile editor validates against THIS, not `ResumeJsonSchema` — parsing
 * a save with the narrower schema silently dropped `x_roleform`, which is
 * where the bullet ids live, and losing those loses every tailored bullet's
 * route back to its source (N1).
 */
export const StoredResumeSchema = ResumeJsonSchema.extend({
  $schema: z.string().optional(),
  x_roleform: RoleformExtensionSchema.optional(),
});

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

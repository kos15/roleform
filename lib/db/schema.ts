/**
 * Drizzle schema — specs.md §6.2.
 *
 * With no test suite (CLAUDE.md §11) these constraints ARE the safety net.
 * Prefer NOT NULL / CHECK / enum over anything a caller has to remember.
 *
 * Two constraints carry the product's promise:
 *   N1 — tailored_bullets.source_bullet_id NOT NULL, ON DELETE RESTRICT
 *   N2 — interview_questions CHECK (type = 'gap' OR evidence is non-empty)
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ enums */

export const extractionStatus = pgEnum("extraction_status", [
  "pending",
  "ok",
  "no_text_layer",
  "encrypted",
  "failed",
]);
export const analysisStatus = pgEnum("analysis_status", ["parsing", "ready", "failed"]);
export const jdSource = pgEnum("jd_source", ["paste", "upload"]);
export const bulletScope = pgEnum("bullet_scope", ["work", "project", "volunteer", "education"]);
export const requirementKind = pgEnum("requirement_kind", [
  "hard_skill",
  "soft_skill",
  "experience",
  "education",
  "certification",
  "responsibility",
]);
export const necessity = pgEnum("necessity", ["required", "preferred", "implied"]);
export const coverageStatus = pgEnum("coverage_status", ["evidenced", "partial", "absent"]);
export const templateKind = pgEnum("template_kind", ["classic", "sidebar", "creative"]);
export const atsRating = pgEnum("ats_rating", ["High", "Medium", "Low"]);
export const transformKind = pgEnum("transform_kind", ["verbatim", "rephrase", "requantify", "omit"]);
export const questionType = pgEnum("question_type", [
  "behavioral",
  "technical",
  "situational",
  "gap",
  "culture",
]);
export const userLevel = pgEnum("user_level", ["none", "exposure", "working", "strong"]);
export const requiredLevel = pgEnum("required_level", ["exposure", "working", "strong", "expert"]);
export const courseLevel = pgEnum("course_level", ["beginner", "intermediate", "advanced"]);
export const exportFormat = pgEnum("export_format", ["pdf", "docx", "zip"]);
export const plan = pgEnum("plan", ["free", "pro"]);

/* ------------------------------------------------------------------ users */

/** clerk_user_id is TEXT, not uuid — Clerk subjects are strings (§5.3). */
export const users = pgTable("users", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  emailHash: text("email_hash").notNull(), // N7: never the address itself
  plan: plan("plan").notNull().default("free"),
  quotaRemaining: integer("quota_remaining").notNull().default(10),
  quotaResetsAt: timestamp("quota_resets_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------- source documents */

export const sourceDocuments = pgTable(
  "source_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull(),
    storagePath: text("storage_path").notNull(),
    bucket: text("bucket").notNull(),
    mime: text("mime").notNull(),
    filename: text("filename").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    extractionStatus: extractionStatus("extraction_status").notNull().default("pending"),
    extractedText: text("extracted_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("source_documents_user_idx").on(t.clerkUserId)],
);

/* --------------------------------------------------------- master profiles */

export const masterProfiles = pgTable(
  "master_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull(),
    resumeJson: jsonb("resume_json").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id, {
      onDelete: "set null",
    }),
    yearsExperience: numeric("years_experience", { precision: 4, scale: 1 }).notNull().default("0"),
    skillCount: integer("skill_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("master_profiles_user_idx").on(t.clerkUserId)],
);

/* ------------------------------------------------------- experience bullets */

/** The evidence table. Written only by user action / reviewed import (N3). */
export const experienceBullets = pgTable(
  "experience_bullets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => masterProfiles.id, { onDelete: "cascade" }),
    scope: bulletScope("scope").notNull(),
    scopeRef: text("scope_ref").notNull(), // 'work.1' — points into resume_json
    ordinal: integer("ordinal").notNull(),
    text: text("text").notNull(), // verbatim, as the user wrote it
    skillIds: uuid("skill_ids").array().notNull().default(sql`'{}'::uuid[]`),
    metrics: jsonb("metrics").notNull().default(sql`'[]'::jsonb`),
    recencyMonths: integer("recency_months"),
  },
  (t) => [
    index("experience_bullets_profile_idx").on(t.profileId),
    index("experience_bullets_user_idx").on(t.clerkUserId),
  ],
);

/* --------------------------------------------------------------- analyses */

export const analyses = pgTable(
  "analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => masterProfiles.id, { onDelete: "restrict" }),
    jdSource: jdSource("jd_source").notNull(),
    jdFilename: text("jd_filename"),
    rawText: text("raw_text").notNull(),
    contentHash: text("content_hash").notNull(),
    company: text("company"),
    title: text("title"),
    location: text("location"),
    seniority: text("seniority"),
    employmentType: text("employment_type"),
    score: numeric("score", { precision: 5, scale: 2 }),
    scoreVerdict: text("score_verdict"),
    scoreNote: text("score_note"),
    status: analysisStatus("status").notNull().default("parsing"),
    stageState: jsonb("stage_state").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // F2: identical JD text reuses the prior analysis — no second charge.
    unique("analyses_user_content_hash").on(t.clerkUserId, t.contentHash),
    index("analyses_user_created_idx").on(t.clerkUserId, t.createdAt),
  ],
);

/* -------------------------------------------------------- jd requirements */

export const jdRequirements = pgTable(
  "jd_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    kind: requirementKind("kind").notNull(),
    text: text("text").notNull(),
    necessity: necessity("necessity").notNull(),
    mentionCount: integer("mention_count").notNull().default(1), // drives Learning order
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "set null" }),
    evidenceQuote: text("evidence_quote").notNull(), // the JD span this came from
  },
  (t) => [index("jd_requirements_analysis_idx").on(t.analysisId)],
);

/* --------------------------------------------------------- coverage items */

export const coverageItems = pgTable(
  "coverage_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => jdRequirements.id, { onDelete: "cascade" }),
    status: coverageStatus("status").notNull(),
    evidenceBulletIds: uuid("evidence_bullet_ids").array().notNull().default(sql`'{}'::uuid[]`),
    rationale: text("rationale").notNull(),
  },
  (t) => [
    // An 'evidenced' verdict without evidence is a lie the DB will not store.
    check(
      "coverage_items_evidenced_has_evidence",
      sql`${t.status} <> 'evidenced' OR array_length(${t.evidenceBulletIds}, 1) > 0`,
    ),
    index("coverage_items_analysis_idx").on(t.analysisId),
  ],
);

/* --------------------------------------------------------------- templates */

/** Seeded reference data. Public read, no RLS. */
export const templates = pgTable("templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: templateKind("kind").notNull(),
  blurb: text("blurb").notNull(),
  accent: text("accent").notNull(),
  structuralFlags: jsonb("structural_flags").notNull(),
});

/* ----------------------------------------------------------- resume drafts */

export const resumeDrafts = pgTable(
  "resume_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "restrict" }),
    resumeJson: jsonb("resume_json").notNull(),
    atsRating: atsRating("ats_rating").notNull(), // computed (N5), never hand-assigned
    pageCount: integer("page_count").notNull().default(1),
    changes: text("changes").array().notNull().default(sql`'{}'::text[]`),
    missing: text("missing").array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("resume_drafts_analysis_template").on(t.analysisId, t.templateId),
    index("resume_drafts_analysis_idx").on(t.analysisId),
  ],
);

/* --------------------------------------------------- tailored bullets (N1) */

export const tailoredBullets = pgTable(
  "tailored_bullets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => resumeDrafts.id, { onDelete: "cascade" }),
    // ★ FABRICATION GUARD #1 — a bullet without provenance cannot exist.
    sourceBulletId: uuid("source_bullet_id")
      .notNull()
      .references(() => experienceBullets.id, { onDelete: "restrict" }),
    originalText: text("original_text").notNull(), // snapshot: profile edits never rewrite history
    rewrittenText: text("rewritten_text").notNull(),
    transform: transformKind("transform").notNull(),
    targetsRequirementId: uuid("targets_requirement_id").references(() => jdRequirements.id, {
      onDelete: "set null",
    }),
    aiRunId: uuid("ai_run_id").references(() => aiRuns.id, { onDelete: "set null" }),
    ordinal: integer("ordinal").notNull().default(0),
  },
  (t) => [index("tailored_bullets_draft_idx").on(t.draftId)],
);

/* ----------------------------------------------- interview questions (N2) */

export const interviewQuestions = pgTable(
  "interview_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    type: questionType("type").notNull(),
    text: text("text").notNull(),
    likely: boolean("likely").notNull().default(false),
    whyTheyAsk: text("why_they_ask").notNull(),
    frame: text("frame").array().notNull(),
    evidenceBulletIds: uuid("evidence_bullet_ids").array().notNull().default(sql`'{}'::uuid[]`),
    sourceRequirementId: uuid("source_requirement_id").references(() => jdRequirements.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    // ★ FABRICATION GUARD #2 — evidence, or explicitly a gap question.
    check(
      "interview_questions_evidence_or_gap",
      sql`${t.type} = 'gap' OR array_length(${t.evidenceBulletIds}, 1) > 0`,
    ),
    index("interview_questions_analysis_idx").on(t.analysisId),
  ],
);

/* ------------------------------------------------------------------ skills */

/** Canonical vocabulary. Public read. */
export const skills = pgTable(
  "skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    category: text("category").notNull(),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [index("skills_name_idx").on(t.name)],
);

/* -------------------------------------------------------------- skill gaps */

export const skillGaps = pgTable(
  "skill_gaps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "restrict" }),
    userLevel: userLevel("user_level").notNull(),
    requiredLevel: requiredLevel("required_level").notNull(),
    mentionCount: integer("mention_count").notNull().default(1),
    note: text("note").notNull(),
  },
  (t) => [index("skill_gaps_analysis_idx").on(t.analysisId)],
);

/* ----------------------------------------------------------------- courses */

/** CURATED catalog (N8). Public read. Never model-generated. */
export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull().unique(),
  priceLabel: text("price_label").notNull(),
  lengthLabel: text("length_label").notNull(),
  level: courseLevel("level").notNull(),
  mark: text("mark").notNull(),
  skillIds: uuid("skill_ids").array().notNull().default(sql`'{}'::uuid[]`),
  isFree: boolean("is_free").notNull(),
  lengthMinutes: integer("length_minutes").notNull(),
  verifiedAt: date("verified_at").notNull(),
});

/* ----------------------------------------------------------------- exports */

export const exports = pgTable(
  "exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id").references(() => resumeDrafts.id, { onDelete: "cascade" }),
    format: exportFormat("format").notNull(),
    storagePath: text("storage_path").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("exports_user_idx").on(t.clerkUserId)],
);

/* ----------------------------------------------------------------- ai runs */

export const aiRuns = pgTable(
  "ai_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull(),
    analysisId: uuid("analysis_id"),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    schemaValid: boolean("schema_valid").notNull(),
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_runs_user_created_idx").on(t.clerkUserId, t.createdAt)],
);

export type Skill = typeof skills.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type ExperienceBullet = typeof experienceBullets.$inferSelect;
export type JdRequirement = typeof jdRequirements.$inferSelect;
export type CoverageItem = typeof coverageItems.$inferSelect;
export type Analysis = typeof analyses.$inferSelect;
export type ResumeDraft = typeof resumeDrafts.$inferSelect;
export type TailoredBullet = typeof tailoredBullets.$inferSelect;
export type InterviewQuestion = typeof interviewQuestions.$inferSelect;
export type SkillGap = typeof skillGaps.$inferSelect;
export type SourceDocument = typeof sourceDocuments.$inferSelect;
export type MasterProfile = typeof masterProfiles.$inferSelect;

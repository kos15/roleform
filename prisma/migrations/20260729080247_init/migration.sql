-- CreateEnum
CREATE TYPE "extraction_status" AS ENUM ('pending', 'ok', 'no_text_layer', 'encrypted', 'failed');

-- CreateEnum
CREATE TYPE "analysis_status" AS ENUM ('parsing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "jd_source" AS ENUM ('paste', 'upload');

-- CreateEnum
CREATE TYPE "bullet_scope" AS ENUM ('work', 'project', 'volunteer', 'education');

-- CreateEnum
CREATE TYPE "requirement_kind" AS ENUM ('hard_skill', 'soft_skill', 'experience', 'education', 'certification', 'responsibility');

-- CreateEnum
CREATE TYPE "necessity" AS ENUM ('required', 'preferred', 'implied');

-- CreateEnum
CREATE TYPE "coverage_status" AS ENUM ('evidenced', 'partial', 'absent');

-- CreateEnum
CREATE TYPE "template_kind" AS ENUM ('classic', 'sidebar', 'creative');

-- CreateEnum
CREATE TYPE "ats_rating" AS ENUM ('High', 'Medium', 'Low');

-- CreateEnum
CREATE TYPE "transform_kind" AS ENUM ('verbatim', 'rephrase', 'requantify', 'omit');

-- CreateEnum
CREATE TYPE "question_type" AS ENUM ('behavioral', 'technical', 'situational', 'gap', 'culture');

-- CreateEnum
CREATE TYPE "user_level" AS ENUM ('none', 'exposure', 'working', 'strong');

-- CreateEnum
CREATE TYPE "required_level" AS ENUM ('exposure', 'working', 'strong', 'expert');

-- CreateEnum
CREATE TYPE "course_level" AS ENUM ('beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "export_format" AS ENUM ('pdf', 'docx', 'zip');

-- CreateEnum
CREATE TYPE "plan" AS ENUM ('free', 'pro');

-- CreateTable
CREATE TABLE "users" (
    "clerk_user_id" TEXT NOT NULL,
    "email_hash" TEXT NOT NULL,
    "plan" "plan" NOT NULL DEFAULT 'free',
    "quota_remaining" INTEGER NOT NULL DEFAULT 10,
    "quota_resets_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("clerk_user_id")
);

-- CreateTable
CREATE TABLE "source_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "extraction_status" "extraction_status" NOT NULL DEFAULT 'pending',
    "extracted_text" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "resume_json" JSONB NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "source_document_id" UUID,
    "years_experience" DECIMAL(4,1) NOT NULL DEFAULT 0,
    "skill_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experience_bullets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "profile_id" UUID NOT NULL,
    "scope" "bullet_scope" NOT NULL,
    "scope_ref" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "skill_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "metrics" JSONB NOT NULL DEFAULT '[]',
    "recency_months" INTEGER,

    CONSTRAINT "experience_bullets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analyses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "profile_id" UUID NOT NULL,
    "jd_source" "jd_source" NOT NULL,
    "jd_filename" TEXT,
    "raw_text" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "company" TEXT,
    "title" TEXT,
    "location" TEXT,
    "seniority" TEXT,
    "employment_type" TEXT,
    "score" DECIMAL(5,2),
    "score_verdict" TEXT,
    "score_note" TEXT,
    "status" "analysis_status" NOT NULL DEFAULT 'parsing',
    "stage_state" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jd_requirements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "analysis_id" UUID NOT NULL,
    "kind" "requirement_kind" NOT NULL,
    "text" TEXT NOT NULL,
    "necessity" "necessity" NOT NULL,
    "mention_count" INTEGER NOT NULL DEFAULT 1,
    "skill_id" UUID,
    "evidence_quote" TEXT NOT NULL,

    CONSTRAINT "jd_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coverage_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "analysis_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "status" "coverage_status" NOT NULL,
    "evidence_bullet_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "rationale" TEXT NOT NULL,

    CONSTRAINT "coverage_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "template_kind" NOT NULL,
    "blurb" TEXT NOT NULL,
    "accent" TEXT NOT NULL,
    "structural_flags" JSONB NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "analysis_id" UUID NOT NULL,
    "template_id" TEXT NOT NULL,
    "resume_json" JSONB NOT NULL,
    "ats_rating" "ats_rating" NOT NULL,
    "page_count" INTEGER NOT NULL DEFAULT 1,
    "changes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "missing" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tailored_bullets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "draft_id" UUID NOT NULL,
    "source_bullet_id" UUID NOT NULL,
    "original_text" TEXT NOT NULL,
    "rewritten_text" TEXT NOT NULL,
    "transform" "transform_kind" NOT NULL,
    "targets_requirement_id" UUID,
    "ai_run_id" UUID,
    "ordinal" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tailored_bullets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "analysis_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "type" "question_type" NOT NULL,
    "text" TEXT NOT NULL,
    "likely" BOOLEAN NOT NULL DEFAULT false,
    "why_they_ask" TEXT NOT NULL,
    "frame" TEXT[],
    "evidence_bullet_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "source_requirement_id" UUID,

    CONSTRAINT "interview_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_gaps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "analysis_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "user_level" "user_level" NOT NULL,
    "required_level" "required_level" NOT NULL,
    "mention_count" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT NOT NULL,

    CONSTRAINT "skill_gaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "price_label" TEXT NOT NULL,
    "length_label" TEXT NOT NULL,
    "level" "course_level" NOT NULL,
    "mark" TEXT NOT NULL,
    "skill_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "is_free" BOOLEAN NOT NULL,
    "length_minutes" INTEGER NOT NULL,
    "verified_at" DATE NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "analysis_id" UUID NOT NULL,
    "draft_id" UUID,
    "format" "export_format" NOT NULL,
    "storage_path" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "analysis_id" UUID,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "schema_valid" BOOLEAN NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "source_documents_user_idx" ON "source_documents"("clerk_user_id");

-- CreateIndex
CREATE INDEX "master_profiles_user_idx" ON "master_profiles"("clerk_user_id");

-- CreateIndex
CREATE INDEX "experience_bullets_profile_idx" ON "experience_bullets"("profile_id");

-- CreateIndex
CREATE INDEX "experience_bullets_user_idx" ON "experience_bullets"("clerk_user_id");

-- CreateIndex
CREATE INDEX "analyses_user_created_idx" ON "analyses"("clerk_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "analyses_user_content_hash" ON "analyses"("clerk_user_id", "content_hash");

-- CreateIndex
CREATE INDEX "jd_requirements_analysis_idx" ON "jd_requirements"("analysis_id");

-- CreateIndex
CREATE INDEX "coverage_items_analysis_idx" ON "coverage_items"("analysis_id");

-- CreateIndex
CREATE INDEX "resume_drafts_analysis_idx" ON "resume_drafts"("analysis_id");

-- CreateIndex
CREATE UNIQUE INDEX "resume_drafts_analysis_template" ON "resume_drafts"("analysis_id", "template_id");

-- CreateIndex
CREATE INDEX "tailored_bullets_draft_idx" ON "tailored_bullets"("draft_id");

-- CreateIndex
CREATE INDEX "interview_questions_analysis_idx" ON "interview_questions"("analysis_id");

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

-- CreateIndex
CREATE INDEX "skills_name_idx" ON "skills"("name");

-- CreateIndex
CREATE INDEX "skill_gaps_analysis_idx" ON "skill_gaps"("analysis_id");

-- CreateIndex
CREATE UNIQUE INDEX "courses_url_key" ON "courses"("url");

-- CreateIndex
CREATE INDEX "exports_user_idx" ON "exports"("clerk_user_id");

-- CreateIndex
CREATE INDEX "ai_runs_user_created_idx" ON "ai_runs"("clerk_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "master_profiles" ADD CONSTRAINT "master_profiles_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experience_bullets" ADD CONSTRAINT "experience_bullets_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "master_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "master_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jd_requirements" ADD CONSTRAINT "jd_requirements_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jd_requirements" ADD CONSTRAINT "jd_requirements_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_items" ADD CONSTRAINT "coverage_items_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_items" ADD CONSTRAINT "coverage_items_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "jd_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_drafts" ADD CONSTRAINT "resume_drafts_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_drafts" ADD CONSTRAINT "resume_drafts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tailored_bullets" ADD CONSTRAINT "tailored_bullets_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "resume_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tailored_bullets" ADD CONSTRAINT "tailored_bullets_source_bullet_id_fkey" FOREIGN KEY ("source_bullet_id") REFERENCES "experience_bullets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tailored_bullets" ADD CONSTRAINT "tailored_bullets_targets_requirement_id_fkey" FOREIGN KEY ("targets_requirement_id") REFERENCES "jd_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tailored_bullets" ADD CONSTRAINT "tailored_bullets_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_source_requirement_id_fkey" FOREIGN KEY ("source_requirement_id") REFERENCES "jd_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_gaps" ADD CONSTRAINT "skill_gaps_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_gaps" ADD CONSTRAINT "skill_gaps_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exports" ADD CONSTRAINT "exports_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exports" ADD CONSTRAINT "exports_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "resume_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraint (N4/N4 guards — CLAUDE.md §2, §13)
-- Prisma has no native CHECK attribute (schema.prisma models note this at each
-- table). These two are hand-added here rather than expressed in the schema,
-- and are exactly what scripts/smoke-constraints.ts (M1.9) verifies.

-- An 'evidenced' verdict without evidence is a lie the DB will not store.
ALTER TABLE "coverage_items" ADD CONSTRAINT "coverage_items_evidenced_has_evidence"
  CHECK (status <> 'evidenced' OR array_length(evidence_bullet_ids, 1) > 0);

-- ★ FABRICATION GUARD #2 — evidence, or explicitly a gap question.
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_evidence_or_gap"
  CHECK (type = 'gap' OR array_length(evidence_bullet_ids, 1) > 0);

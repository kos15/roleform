-- Roleform Learning Engine — the taxonomy spine, the corpus, and the plan.
--
-- Generated with `prisma migrate diff`, then EXTENDED BY HAND with the two
-- CHECK constraints at the foot of this file. Prisma has no CHECK attribute,
-- so — exactly as with N1/N2 in the init migration (CLAUDE.md §13) — the
-- guards that carry the product's promise are written once, here, and never
-- touched again.
--
-- Read `learning recommendation engine/spec.md` §0 before changing anything in
-- here. The shape of these tables IS the cost model: `skill_bundles` exists so
-- that request-time retrieval is a primary-key lookup, and `course_skills`
-- exists so an entry point is computed once at ingest rather than per request.

-- CreateEnum
CREATE TYPE "skill_volatility" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "resource_type" AS ENUM ('course', 'video', 'doc', 'repo', 'roadmap');

-- CreateEnum
CREATE TYPE "resource_status" AS ENUM ('active', 'stale', 'dead', 'quarantined');

-- CreateEnum
CREATE TYPE "skill_level" AS ENUM ('intro', 'working', 'deep');

-- CreateEnum
CREATE TYPE "evidence_bucket" AS ENUM ('strong', 'partial', 'none');

-- AlterTable
ALTER TABLE "skills" ADD COLUMN     "depth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parent_id" UUID,
ADD COLUMN     "roadmap_path" TEXT,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "volatility" "skill_volatility" NOT NULL DEFAULT 'medium';

-- AlterTable
ALTER TABLE "skill_gaps" ADD COLUMN     "answers_question_id" UUID,
ADD COLUMN     "evidence_bucket" "evidence_bucket" NOT NULL DEFAULT 'none',
ADD COLUMN     "evidence_credit" DECIMAL(4,3) NOT NULL DEFAULT 0,
ADD COLUMN     "fallback_label" TEXT,
ADD COLUMN     "fallback_url" TEXT,
ADD COLUMN     "importance" DECIMAL(4,3) NOT NULL DEFAULT 0,
ADD COLUMN     "jd_quote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ordinal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "requirement_id" UUID,
ADD COLUMN     "severity" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "target_level" "skill_level" NOT NULL DEFAULT 'working',
ADD COLUMN     "unlocks_bullet_draft" TEXT,
ADD COLUMN     "unlocks_bullet_id" UUID,
ADD COLUMN     "why_it_matters" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "author" TEXT,
ADD COLUMN     "corpus_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "published_at" DATE,
ADD COLUMN     "quality_score" DECIMAL(4,3) NOT NULL DEFAULT 0.5,
ADD COLUMN     "status" "resource_status" NOT NULL DEFAULT 'active',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "type" "resource_type" NOT NULL DEFAULT 'course';

-- CreateTable
CREATE TABLE "unresolved_terms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "normalised" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "seen_count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unresolved_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corpus_gaps" (
    "skill_id" UUID NOT NULL,
    "level" "skill_level" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corpus_gaps_pkey" PRIMARY KEY ("skill_id","level")
);

-- CreateTable
CREATE TABLE "learning_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "analysis_id" UUID NOT NULL,
    "opening" TEXT NOT NULL,
    "sequence_note" TEXT NOT NULL,
    "budget_min" INTEGER,
    "total_min" INTEGER NOT NULL DEFAULT 0,
    "fallback_count" INTEGER NOT NULL DEFAULT 0,
    "resolution_rate" DECIMAL(4,3) NOT NULL DEFAULT 1,
    "ai_run_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "plan_id" UUID NOT NULL,
    "gap_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "starts_at_min" INTEGER NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "entry_label" TEXT,
    "entry_url" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "unlocks_bullet_id" UUID NOT NULL,
    "answers_question_id" UUID NOT NULL,

    CONSTRAINT "learning_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_skills" (
    "course_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "level" "skill_level" NOT NULL,
    "confidence" DECIMAL(4,3) NOT NULL DEFAULT 1,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "entry_label" TEXT,
    "entry_url" TEXT,
    "summary" TEXT,

    CONSTRAINT "course_skills_pkey" PRIMARY KEY ("course_id","skill_id")
);

-- CreateTable
CREATE TABLE "skill_bundles" (
    "skill_id" UUID NOT NULL,
    "level" "skill_level" NOT NULL,
    "ranked_course_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "entry_points" JSONB NOT NULL DEFAULT '{}',
    "corpus_version" INTEGER NOT NULL DEFAULT 1,
    "refreshed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_bundles_pkey" PRIMARY KEY ("skill_id","level")
);

-- CreateIndex
CREATE UNIQUE INDEX "unresolved_terms_normalised_key" ON "unresolved_terms"("normalised");

-- CreateIndex
CREATE INDEX "unresolved_terms_demand_idx" ON "unresolved_terms"("seen_count" DESC);

-- CreateIndex
CREATE INDEX "corpus_gaps_demand_idx" ON "corpus_gaps"("count" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "learning_plans_analysis_id_key" ON "learning_plans"("analysis_id");

-- CreateIndex
CREATE INDEX "learning_steps_plan_idx" ON "learning_steps"("plan_id", "ordinal");

-- CreateIndex
CREATE INDEX "learning_steps_gap_idx" ON "learning_steps"("gap_id");

-- CreateIndex
CREATE INDEX "course_skills_lookup_idx" ON "course_skills"("skill_id", "level", "confidence" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "skills_slug_key" ON "skills"("slug");

-- CreateIndex
CREATE INDEX "skills_parent_idx" ON "skills"("parent_id");

-- CreateIndex
CREATE INDEX "skill_gaps_unlocks_bullet_idx" ON "skill_gaps"("unlocks_bullet_id");

-- CreateIndex
CREATE INDEX "courses_status_idx" ON "courses"("status");

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corpus_gaps" ADD CONSTRAINT "corpus_gaps_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_gaps" ADD CONSTRAINT "skill_gaps_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "jd_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_gaps" ADD CONSTRAINT "skill_gaps_unlocks_bullet_id_fkey" FOREIGN KEY ("unlocks_bullet_id") REFERENCES "experience_bullets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_gaps" ADD CONSTRAINT "skill_gaps_answers_question_id_fkey" FOREIGN KEY ("answers_question_id") REFERENCES "interview_questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_plans" ADD CONSTRAINT "learning_plans_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_plans" ADD CONSTRAINT "learning_plans_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_steps" ADD CONSTRAINT "learning_steps_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "learning_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_steps" ADD CONSTRAINT "learning_steps_gap_id_fkey" FOREIGN KEY ("gap_id") REFERENCES "skill_gaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_steps" ADD CONSTRAINT "learning_steps_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_steps" ADD CONSTRAINT "learning_steps_unlocks_bullet_id_fkey" FOREIGN KEY ("unlocks_bullet_id") REFERENCES "experience_bullets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_steps" ADD CONSTRAINT "learning_steps_answers_question_id_fkey" FOREIGN KEY ("answers_question_id") REFERENCES "interview_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_skills" ADD CONSTRAINT "course_skills_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_skills" ADD CONSTRAINT "course_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_bundles" ADD CONSTRAINT "skill_bundles_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════════════
-- ★ HAND-WRITTEN GUARDS — RLE spec §1 and §9. Do not regenerate away.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── PROOF-OF-LEARNING ──────────────────────────────────────────────────────
-- Spec §1: "A resource that cannot be bound to all three is not shown" — the
-- gap it closes, the résumé bullet it unlocks, the interview question it
-- answers. Two of the three are NOT NULL columns on learning_steps, so the FK
-- declarations above already enforce them. This CHECK covers the third thing a
-- NOT NULL cannot say: a step must sit somewhere real in the sequence, and a
-- zero-length step is not a plan entry.
--
-- `cardinality`-style trap avoided deliberately: these are scalar comparisons,
-- never array_length, which is NULL on an empty array and therefore inert —
-- the mistake the repair migration had to fix for N1 and N2.
ALTER TABLE "learning_steps"
  ADD CONSTRAINT "learning_steps_sequenced"
  CHECK ("ordinal" >= 0 AND "starts_at_min" >= 0 AND "duration_min" > 0);

-- ── FALLBACK EXCLUSIVITY ───────────────────────────────────────────────────
-- Spec §9: a gap either has vetted material or it has the roadmap link. A row
-- carrying half a fallback (a URL with no label) would render a bare link with
-- no explanation, which is precisely the unexplained-link failure N8 exists to
-- prevent.
ALTER TABLE "skill_gaps"
  ADD CONSTRAINT "skill_gaps_fallback_complete"
  CHECK (("fallback_url" IS NULL) = ("fallback_label" IS NULL));

-- ── SEVERITY IS A PERCENTAGE ───────────────────────────────────────────────
-- severity = importance × (1 − evidence) × 100, and each input is clamped 0–1
-- in lib/domain/severity.ts. A value outside 0–100 here means the pure
-- function was bypassed, which is the one failure the light-testing policy
-- (CLAUDE.md §11) has no other way to catch.
ALTER TABLE "skill_gaps"
  ADD CONSTRAINT "skill_gaps_severity_range"
  CHECK ("severity" >= 0 AND "severity" <= 100
     AND "importance" >= 0 AND "importance" <= 1
     AND "evidence_credit" >= 0 AND "evidence_credit" <= 1);

-- ── TAXONOMY IS A FOREST ───────────────────────────────────────────────────
-- A node cannot be its own parent. Deeper cycles are caught by
-- `assertTaxonomy()` before the seed script writes anything; this catches the
-- one-hop case at the only layer that can catch it cheaply.
ALTER TABLE "skills"
  ADD CONSTRAINT "skills_not_own_parent"
  CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

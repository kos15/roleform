-- Roadmap (F21). A per-analysis checklist compiled from rows the analysis
-- already holds — questions, learning steps, gaps, drafts, saved jobs. No
-- model call anywhere in this table's write path (N13): `roadmap_items` is
-- written once, by a pure compiler (lib/domain/roadmap.ts), from rows that
-- already exist. Completion (`done_at`) is the one column on this table a
-- user, not the compiler, ever writes (N15).

-- CreateEnum
CREATE TYPE "roadmap_section" AS ENUM ('prepare', 'rehearse', 'deepen', 'learn', 'apply');

CREATE TYPE "roadmap_item_kind" AS ENUM
  ('fixed', 'question', 'answer', 'learning_step', 'gap', 'saved_job');

-- CreateTable
CREATE TABLE "roadmaps" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "clerk_user_id" TEXT NOT NULL,
  "analysis_id"   UUID NOT NULL,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "roadmaps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "roadmaps_analysis_id_fkey" FOREIGN KEY ("analysis_id")
    REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- One roadmap per analysis, ever. A rebuild is not a feature (PRD F21 §2.5 —
-- built once, on demand); this is what makes "once" a database fact.
CREATE UNIQUE INDEX "roadmaps_analysis_id_key" ON "roadmaps"("analysis_id");

-- CreateTable
CREATE TABLE "roadmap_items" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "clerk_user_id"    TEXT NOT NULL,
  "roadmap_id"       UUID NOT NULL,
  "key"              TEXT NOT NULL,
  "section"          "roadmap_section" NOT NULL,
  "ordinal"          INTEGER NOT NULL,
  "label"            TEXT NOT NULL,
  "kind"             "roadmap_item_kind" NOT NULL,
  "question_id"      UUID,
  "learning_step_id" UUID,
  "gap_id"           UUID,
  "saved_job_id"     UUID,
  "done_at"          TIMESTAMPTZ,

  CONSTRAINT "roadmap_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "roadmap_items_roadmap_id_fkey" FOREIGN KEY ("roadmap_id")
    REFERENCES "roadmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "roadmap_items_question_id_fkey" FOREIGN KEY ("question_id")
    REFERENCES "interview_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "roadmap_items_learning_step_id_fkey" FOREIGN KEY ("learning_step_id")
    REFERENCES "learning_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "roadmap_items_gap_id_fkey" FOREIGN KEY ("gap_id")
    REFERENCES "skill_gaps"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "roadmap_items_saved_job_id_fkey" FOREIGN KEY ("saved_job_id")
    REFERENCES "saved_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "roadmap_items_roadmap_key" ON "roadmap_items"("roadmap_id", "key");
CREATE INDEX "roadmap_items_roadmap_idx" ON "roadmap_items"("roadmap_id");

-- ---------------------------------------------------------------------------
-- Hand-added CHECK (CLAUDE.md §13, N14): exactly the one foreign key that
-- matches `kind` may be set. A `fixed` item (read the buckets, download,
-- apply, follow up) names none of them — its label is the step itself, not a
-- claim about a row. `question` and `answer` both point at `question_id`: an
-- "answer" item is "draft the worked answer to THIS question", the same row
-- a "question" item rehearses, so they share the one FK that names it.
--
-- This is the roadmap's version of N1/N2: a step that names nothing is a
-- claim about work the user never generated, and the database — not a
-- convention the compiler has to remember — makes that state unrepresentable.
-- ---------------------------------------------------------------------------
ALTER TABLE "roadmap_items" ADD CONSTRAINT "roadmap_items_kind_fk"
  CHECK (
    CASE "kind"
      WHEN 'fixed'         THEN "question_id" IS NULL AND "learning_step_id" IS NULL AND "gap_id" IS NULL AND "saved_job_id" IS NULL
      WHEN 'question'      THEN "question_id" IS NOT NULL AND "learning_step_id" IS NULL AND "gap_id" IS NULL AND "saved_job_id" IS NULL
      WHEN 'answer'        THEN "question_id" IS NOT NULL AND "learning_step_id" IS NULL AND "gap_id" IS NULL AND "saved_job_id" IS NULL
      WHEN 'learning_step' THEN "question_id" IS NULL AND "learning_step_id" IS NOT NULL AND "gap_id" IS NULL AND "saved_job_id" IS NULL
      WHEN 'gap'           THEN "question_id" IS NULL AND "learning_step_id" IS NULL AND "gap_id" IS NOT NULL AND "saved_job_id" IS NULL
      WHEN 'saved_job'     THEN "question_id" IS NULL AND "learning_step_id" IS NULL AND "gap_id" IS NULL AND "saved_job_id" IS NOT NULL
    END
  );

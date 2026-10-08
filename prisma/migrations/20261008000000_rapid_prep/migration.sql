-- Rapid prep (F26). Revision decks, timed quiz rounds, coding challenges and
-- the attempts submitted against them. All four carry clerk_user_id and get
-- the standard own-rows RLS policy in lib/db/policies.sql (N10). None carries
-- a claim about the candidate, so there is no evidence FK to bind (N1/N2 do
-- not apply); the CHECKs below make the wrong states of the drills
-- themselves unrepresentable instead.

-- CreateEnum
CREATE TYPE "challenge_source" AS ENUM ('bank', 'generated');

-- CreateEnum
CREATE TYPE "drill_difficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateEnum
CREATE TYPE "code_language" AS ENUM ('javascript', 'python', 'java', 'cpp');

-- CreateTable
CREATE TABLE "revision_decks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "analysis_id" UUID NOT NULL,
    "minutes" INTEGER NOT NULL,
    "cards" JSONB NOT NULL DEFAULT '[]',
    "ai_run_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revision_decks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_rounds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "analysis_id" UUID NOT NULL,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "total" INTEGER NOT NULL,
    "seconds_per_question" INTEGER NOT NULL,
    "picks" JSONB,
    "correct" INTEGER,
    "finished_at" TIMESTAMPTZ,
    "ai_run_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coding_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "analysis_id" UUID NOT NULL,
    "source" "challenge_source" NOT NULL,
    "bank_slug" TEXT,
    "difficulty" "drill_difficulty" NOT NULL,
    "language" "code_language" NOT NULL,
    "minutes" INTEGER NOT NULL,
    "body" JSONB,
    "hints_revealed" INTEGER NOT NULL DEFAULT 0,
    "solution_revealed_at" TIMESTAMPTZ,
    "ai_run_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coding_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "challenge_id" UUID NOT NULL,
    "language" "code_language" NOT NULL,
    "code" TEXT NOT NULL,
    "seconds_used" INTEGER NOT NULL,
    "tests_passed" INTEGER,
    "tests_total" INTEGER,
    "evaluation" JSONB NOT NULL,
    "verdict" TEXT NOT NULL,
    "ai_run_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "revision_decks_analysis_minutes" ON "revision_decks"("analysis_id", "minutes");

-- CreateIndex
CREATE INDEX "quiz_rounds_analysis_idx" ON "quiz_rounds"("analysis_id");

-- CreateIndex
CREATE INDEX "coding_challenges_analysis_idx" ON "coding_challenges"("analysis_id");

-- CreateIndex
CREATE INDEX "code_attempts_challenge_idx" ON "code_attempts"("challenge_id");

-- AddForeignKey
ALTER TABLE "revision_decks" ADD CONSTRAINT "revision_decks_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_decks" ADD CONSTRAINT "revision_decks_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_rounds" ADD CONSTRAINT "quiz_rounds_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_rounds" ADD CONSTRAINT "quiz_rounds_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coding_challenges" ADD CONSTRAINT "coding_challenges_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coding_challenges" ADD CONSTRAINT "coding_challenges_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_attempts" ADD CONSTRAINT "code_attempts_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "coding_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_attempts" ADD CONSTRAINT "code_attempts_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-added CHECKs (CLAUDE.md §11: a constraint over a validation function).
-- ---------------------------------------------------------------------------

-- The four budgets the Revise screen offers. Anything else is a deck size
-- `cardsForBudget` cannot name.
ALTER TABLE "revision_decks" ADD CONSTRAINT "revision_decks_minutes"
  CHECK ("minutes" IN (10, 20, 30, 45));

-- A round is 5–15 questions. A grade exists exactly when the round is
-- finished, and is a count that cannot exceed the round (N16: n of m).
ALTER TABLE "quiz_rounds" ADD CONSTRAINT "quiz_rounds_total"
  CHECK ("total" BETWEEN 5 AND 15 AND "seconds_per_question" BETWEEN 10 AND 120);
ALTER TABLE "quiz_rounds" ADD CONSTRAINT "quiz_rounds_graded_when_finished"
  CHECK ((("correct" IS NULL) = ("finished_at" IS NULL)) AND (("picks" IS NULL) = ("finished_at" IS NULL)));
ALTER TABLE "quiz_rounds" ADD CONSTRAINT "quiz_rounds_correct_bounds"
  CHECK ("correct" IS NULL OR ("correct" >= 0 AND "correct" <= "total"));

-- A bank challenge names its bank problem and carries no body; a generated
-- one carries its body and names no bank problem. Three hints, at most.
ALTER TABLE "coding_challenges" ADD CONSTRAINT "coding_challenges_source_shape"
  CHECK (
    CASE "source"
      WHEN 'bank'      THEN "bank_slug" IS NOT NULL AND "body" IS NULL
      WHEN 'generated' THEN "bank_slug" IS NULL AND "body" IS NOT NULL
    END
  );
ALTER TABLE "coding_challenges" ADD CONSTRAINT "coding_challenges_bounds"
  CHECK ("hints_revealed" BETWEEN 0 AND 3 AND "minutes" BETWEEN 5 AND 90);

-- Test counts come as a pair or not at all (Java and C++ are reviewed by
-- reading), and never claim more passes than tests. Code is capped at the
-- same 12,000 characters MAX_CODE_CHARS enforces before the model call.
ALTER TABLE "code_attempts" ADD CONSTRAINT "code_attempts_tests_pair"
  CHECK (
    (("tests_passed" IS NULL) = ("tests_total" IS NULL))
    AND ("tests_passed" IS NULL OR ("tests_passed" >= 0 AND "tests_passed" <= "tests_total"))
  );
ALTER TABLE "code_attempts" ADD CONSTRAINT "code_attempts_code_length"
  CHECK (char_length("code") <= 12000 AND "seconds_used" >= 0);

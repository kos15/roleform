-- AlterEnum
ALTER TYPE "question_type" ADD VALUE 'system_design';

-- CreateTable
CREATE TABLE "question_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "question_id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "headline" TEXT NOT NULL,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "resume_hooks" JSONB NOT NULL DEFAULT '[]',
    "follow_ups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "key_concepts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ai_run_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "question_answers_question_id_key" ON "question_answers"("question_id");

-- CreateIndex
CREATE INDEX "question_answers_analysis_idx" ON "question_answers"("analysis_id");

-- AddForeignKey
ALTER TABLE "question_answers" ADD CONSTRAINT "question_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "interview_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_answers" ADD CONSTRAINT "question_answers_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Study plans (F30): the member's own weekly windows, topic order and alert
-- choice for one posting, how far they have ticked into each learning step,
-- and the alerts the plan implies. No model call anywhere on this path (N13
-- applied). Generated with `prisma migrate diff`; the CHECK block at the end
-- is added by hand (CLAUDE.md §13), like every CHECK before it.
-- CreateEnum
CREATE TYPE "study_persona" AS ENUM ('pro', 'student');

-- CreateEnum
CREATE TYPE "study_alert" AS ENUM ('before_10', 'before_15', 'before_30', 'off');

-- CreateTable
CREATE TABLE "study_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "analysis_id" UUID NOT NULL,
    "interview_on" DATE,
    "keep_revision_day" BOOLEAN NOT NULL DEFAULT true,
    "persona" "study_persona" NOT NULL DEFAULT 'pro',
    "windows" JSONB NOT NULL DEFAULT '[]',
    "topic_order" UUID[] DEFAULT ARRAY[]::UUID[],
    "topics_off" UUID[] DEFAULT ARRAY[]::UUID[],
    "alert" "study_alert" NOT NULL DEFAULT 'before_15',
    "time_zone" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "plan_id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "done_on" DATE NOT NULL,
    "up_to_min" INTEGER NOT NULL,

    CONSTRAINT "study_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_reminders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "plan_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "due_at" TIMESTAMPTZ NOT NULL,
    "status" "reminder_status" NOT NULL DEFAULT 'pending',
    "settled_at" TIMESTAMPTZ,
    "delivered" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "study_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "study_plans_analysis" ON "study_plans"("analysis_id");

-- CreateIndex
CREATE INDEX "study_plans_user_idx" ON "study_plans"("clerk_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_progress_plan_step_day" ON "study_progress"("plan_id", "step_id", "done_on");

-- CreateIndex
CREATE INDEX "study_reminders_due_idx" ON "study_reminders"("status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "study_reminders_plan_start" ON "study_reminders"("plan_id", "starts_at");

-- AddForeignKey
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_progress" ADD CONSTRAINT "study_progress_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "study_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_progress" ADD CONSTRAINT "study_progress_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "learning_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_reminders" ADD CONSTRAINT "study_reminders_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "study_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Hand-added CHECKs (CLAUDE.md §11: the constraints are the test suite).
-- ---------------------------------------------------------------------------

-- The windows are a short JSON array (shape checked by Zod on write); the
-- zone is one Intl can name.
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_windows_array"
  CHECK (jsonb_typeof("windows") = 'array' AND jsonb_array_length("windows") <= 8);
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_time_zone_len"
  CHECK (char_length("time_zone") BETWEEN 1 AND 64);

-- A tick covers some of the step — never none, never a day's worth.
ALTER TABLE "study_progress" ADD CONSTRAINT "study_progress_up_to_positive"
  CHECK ("up_to_min" BETWEEN 1 AND 1440);

-- A session is a real length, and its alert never fires after it starts.
ALTER TABLE "study_reminders" ADD CONSTRAINT "study_reminders_duration_range"
  CHECK ("duration_min" BETWEEN 5 AND 480);
ALTER TABLE "study_reminders" ADD CONSTRAINT "study_reminders_due_before_start"
  CHECK ("due_at" <= "starts_at");

-- Same claim rule as round reminders: settled exactly when no longer pending,
-- and only a sent one has reached a device.
ALTER TABLE "study_reminders" ADD CONSTRAINT "study_reminders_settled_has_date"
  CHECK (("status" = 'pending') = ("settled_at" IS NULL));
ALTER TABLE "study_reminders" ADD CONSTRAINT "study_reminders_delivered_only_when_sent"
  CHECK ("delivered" >= 0 AND (("status" = 'sent') = ("delivered" > 0)));

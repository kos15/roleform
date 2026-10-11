-- Interview rounds and push reminders (F29). The member's own calendar for a
-- posting, the reminders it implies, and the devices that agreed to hear about
-- them. No model call anywhere on this path (N13 applied). Generated with
-- `prisma migrate diff`; the CHECK block at the end is added by hand
-- (CLAUDE.md §13), like every CHECK before it.
-- CreateEnum
CREATE TYPE "interview_round_status" AS ENUM ('upcoming', 'done', 'cancelled');

-- CreateEnum
CREATE TYPE "reminder_lead" AS ENUM ('day_before', 'hour_before', 'quarter_hour_before');

-- CreateEnum
CREATE TYPE "reminder_status" AS ENUM ('pending', 'sent', 'skipped', 'failed');

-- CreateTable
CREATE TABLE "interview_rounds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "analysis_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "scheduled_at" TIMESTAMPTZ NOT NULL,
    "time_zone" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "interview_round_status" NOT NULL DEFAULT 'upcoming',
    "leads" "reminder_lead"[] DEFAULT ARRAY[]::"reminder_lead"[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_reminders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "round_id" UUID NOT NULL,
    "lead" "reminder_lead" NOT NULL,
    "due_at" TIMESTAMPTZ NOT NULL,
    "status" "reminder_status" NOT NULL DEFAULT 'pending',
    "settled_at" TIMESTAMPTZ,
    "delivered" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "round_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "device_label" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sent_at" TIMESTAMPTZ,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_rounds_user_analysis_idx" ON "interview_rounds"("clerk_user_id", "analysis_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "round_reminders_due_idx" ON "round_reminders"("status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "round_reminders_round_lead" ON "round_reminders"("round_id", "lead");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions"("clerk_user_id");

-- AddForeignKey
ALTER TABLE "interview_rounds" ADD CONSTRAINT "interview_rounds_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_reminders" ADD CONSTRAINT "round_reminders_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "interview_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_clerk_user_id_fkey" FOREIGN KEY ("clerk_user_id") REFERENCES "users"("clerk_user_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-added CHECKs (CLAUDE.md §11: the constraints are the test suite).
-- ---------------------------------------------------------------------------

-- A round has a name a lock screen can show, and notes a person could write.
ALTER TABLE "interview_rounds" ADD CONSTRAINT "interview_rounds_label_len"
  CHECK (char_length(btrim("label")) BETWEEN 1 AND 120);
ALTER TABLE "interview_rounds" ADD CONSTRAINT "interview_rounds_notes_len"
  CHECK (char_length("notes") <= 2000);
ALTER TABLE "interview_rounds" ADD CONSTRAINT "interview_rounds_time_zone_len"
  CHECK (char_length("time_zone") BETWEEN 1 AND 64);

-- A reminder that is no longer pending was claimed at a moment, and only a
-- sent one has reached a device. The claim is the idempotency guarantee: the
-- sender flips pending → settled in one UPDATE before it sends anything.
ALTER TABLE "round_reminders" ADD CONSTRAINT "round_reminders_settled_has_date"
  CHECK (("status" = 'pending') = ("settled_at" IS NULL));
ALTER TABLE "round_reminders" ADD CONSTRAINT "round_reminders_delivered_only_when_sent"
  CHECK ("delivered" >= 0 AND (("status" = 'sent') = ("delivered" > 0)));

-- Both halves of the device key are present and the endpoint is an https URL
-- the push service issued — never something the app assembled (N18 applied).
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_endpoint_https"
  CHECK ("endpoint" LIKE 'https://%' AND char_length("endpoint") <= 2048);
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_keys_present"
  CHECK (char_length("p256dh") > 0 AND char_length("auth") > 0);

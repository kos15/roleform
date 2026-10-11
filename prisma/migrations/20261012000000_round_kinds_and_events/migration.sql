-- Round kinds and countdown events (F29.1). What the member is preparing for
-- (L1, L2, system design, LLD…), and reminders beyond the day-of: a week and
-- three days out, the morning of, and a "how did it go?" nudge afterwards.
-- Generated with `prisma migrate diff`. Postgres adds enum values in place;
-- none is used in this same migration, so it is safe inside the transaction.
-- CreateEnum
CREATE TYPE "round_kind" AS ENUM ('screening', 'l1', 'l2', 'l3', 'dsa', 'system_design', 'lld', 'behavioral', 'managerial', 'hr', 'take_home', 'other');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "reminder_lead" ADD VALUE 'week_before';
ALTER TYPE "reminder_lead" ADD VALUE 'three_days_before';
ALTER TYPE "reminder_lead" ADD VALUE 'morning_of';
ALTER TYPE "reminder_lead" ADD VALUE 'after_round';

-- AlterTable
ALTER TABLE "interview_rounds" ADD COLUMN     "kind" "round_kind" NOT NULL DEFAULT 'other';


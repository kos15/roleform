-- CreateEnum
CREATE TYPE "mail_delivery" AS ENUM ('pending', 'sent', 'failed', 'disabled');

-- AlterTable
ALTER TABLE "contact_messages"
  ADD COLUMN "notification"   "mail_delivery" NOT NULL DEFAULT 'pending',
  ADD COLUMN "receipt"        "mail_delivery" NOT NULL DEFAULT 'pending',
  ADD COLUMN "notified_at"    TIMESTAMPTZ,
  ADD COLUMN "delivery_error" TEXT,
  ADD COLUMN "handled_at"     TIMESTAMPTZ,
  ADD COLUMN "handled_by"     TEXT;

-- CreateIndex
CREATE INDEX "contact_messages_handled_idx" ON "contact_messages"("handled_at");

-- ---------------------------------------------------------------------------
-- Hand-added CHECK constraints (CLAUDE.md §13).
--
-- The support inbox has no test covering it, so the two invariants an admin
-- would otherwise have to remember are enforced here instead (§11).
--
--   1. Handled is a fact with an owner. A row marked answered with nobody's
--      name against it is a message two people each assume the other took.
--   2. `sent` means we have a timestamp for it. Without this, a half-written
--      update could leave the inbox claiming a delivery it cannot date.
-- ---------------------------------------------------------------------------
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_handled_pair"
  CHECK (("handled_at" IS NULL) = ("handled_by" IS NULL));

ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_notified_dated"
  CHECK ("notification" <> 'sent' OR "notified_at" IS NOT NULL);

-- The token meter (F19).
--
-- Adds the fifth cap — the only one that measures what a run actually costs
-- rather than how many of them there were — plus one-off top-ups and a third
-- plan for both to sit on.
--
-- There is deliberately NO `tokens_used` column and NO `topup_tokens` column.
-- Usage is SUMmed from `ai_runs`, which has recorded real input/output tokens
-- since M1; top-ups are SUMmed from `token_grants`, one row per grant. Both
-- balances are therefore facts about rows that exist rather than counters two
-- writes could drift apart — the same reasoning that removed the analyses
-- refund path in M7.

-- AlterEnum
ALTER TYPE "plan" ADD VALUE IF NOT EXISTS 'ultra';

-- CreateEnum
CREATE TYPE "token_grant_source" AS ENUM ('purchase', 'admin');

-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "cap_tokens" INTEGER NOT NULL DEFAULT 60000;

-- ---------------------------------------------------------------------------
-- Backfill the cycle anchor.
--
-- `quota_resets_at` has been nullable and unwritten since the init migration,
-- and every read of `cycleStart` fell through to `now` — which meant usage was
-- counted from that instant, so the F15 caps read zero-used and never bound.
-- The token meter reads the same anchor, and with a null one it would both
-- refuse to fire AND (through the carry rule) treat every historical ai_run as
-- a past cycle that had eaten into the top-up pool.
--
-- Anchored to the account's own creation, so each member's window is laid out
-- from the day they joined rather than from the day this migration ran.
-- ---------------------------------------------------------------------------
UPDATE "users" SET "quota_resets_at" = "created_at" WHERE "quota_resets_at" IS NULL;

ALTER TABLE "workspace_settings"
  ADD COLUMN "cap_tokens" INTEGER NOT NULL DEFAULT 60000;

-- AlterTable
ALTER TABLE "analyses"
  ADD COLUMN "queued_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "token_grants" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "clerk_user_id" TEXT NOT NULL,
  "tokens"        INTEGER NOT NULL,
  "source"        "token_grant_source" NOT NULL,
  "reference"     TEXT NOT NULL,
  "granted_by"    TEXT,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "token_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
--
-- UNIQUE on the reference is the idempotency guarantee, not a lookup index.
-- Razorpay redelivers a webhook on any non-2xx, and this turns the second
-- delivery of one payment into a conflict rather than a second credit.
CREATE UNIQUE INDEX "token_grants_reference_key" ON "token_grants"("reference");
CREATE INDEX "token_grants_user_idx" ON "token_grants"("clerk_user_id");

-- AddForeignKey
ALTER TABLE "token_grants" ADD CONSTRAINT "token_grants_clerk_user_id_fkey"
  FOREIGN KEY ("clerk_user_id") REFERENCES "users"("clerk_user_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
--
-- The analyze screen asks "does this member have anything queued" on every
-- visit, and the answer is almost always no. Partial, because indexing the
-- nulls would be indexing every row in the table to find the handful that
-- aren't.
CREATE INDEX "analyses_queued_idx" ON "analyses"("clerk_user_id", "queued_at")
  WHERE "queued_at" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Hand-added CHECK constraints (CLAUDE.md §13).
--
-- With no test suite these ARE the guarantee (§11). Four of them:
--
--   1/2. The allowance is bounded by the same range the admin panel clamps to
--        (lib/domain/quotas.ts). 0 is a legitimate setting — "off" — which is
--        why this is a CHECK on a NOT NULL column rather than a nullable one.
--   3.   A grant is a positive number of tokens. A zero grant is a row that
--        says nothing; a negative one is a clawback we have no product for,
--        and it would silently make somebody's balance smaller than the
--        pricing page says it is.
--   4.   A queued analysis has not finished. Queuing a `ready` run would mean
--        the resume path re-runs an analysis the member already has, and
--        charges them for it twice.
-- ---------------------------------------------------------------------------
ALTER TABLE "users" ADD CONSTRAINT "users_cap_tokens_range"
  CHECK ("cap_tokens" >= 0 AND "cap_tokens" <= 4000000);

ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_cap_tokens_range"
  CHECK ("cap_tokens" >= 0 AND "cap_tokens" <= 4000000);

ALTER TABLE "token_grants" ADD CONSTRAINT "token_grants_positive"
  CHECK ("tokens" > 0);

ALTER TABLE "analyses" ADD CONSTRAINT "analyses_queued_unfinished"
  CHECK ("queued_at" IS NULL OR "status" <> 'ready');

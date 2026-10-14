-- CreateEnum
CREATE TYPE "push_category" AS ENUM ('round', 'study', 'test');

-- CreateEnum
CREATE TYPE "push_delivery_status" AS ENUM ('queued', 'sending', 'accepted', 'failed', 'expired', 'gone', 'cancelled');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notify_details" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notify_rounds" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_study" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "push_subscriptions" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "push_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "subscription_id" UUID,
    "category" "push_category" NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "status" "push_delivery_status" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_until" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "last_status" INTEGER,
    "accepted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "push_deliveries_due_idx" ON "push_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "push_deliveries_user_idx" ON "push_deliveries"("clerk_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_deliveries_device_dedupe" ON "push_deliveries"("subscription_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_clerk_user_id_fkey" FOREIGN KEY ("clerk_user_id") REFERENCES "users"("clerk_user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "push_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-added CHECKs (CLAUDE.md §11: the constraints are the test suite).
-- F29.2 — the push outbox.

-- What the lock screen may show, bounded. Mirrors PushPayloadSchema.
ALTER TABLE "push_deliveries"
  ADD CONSTRAINT "push_deliveries_title_len" CHECK (char_length("title") BETWEEN 1 AND 120),
  ADD CONSTRAINT "push_deliveries_body_len" CHECK (char_length("body") <= 240),
  ADD CONSTRAINT "push_deliveries_tag_len" CHECK (char_length("tag") BETWEEN 1 AND 64),
  ADD CONSTRAINT "push_deliveries_dedupe_len" CHECK (char_length("dedupe_key") BETWEEN 1 AND 120);

-- A tap opens an in-app path and nothing else: one leading slash, never "//"
-- (protocol-relative), never a backslash (WHATWG URL reads "/\x" as "//x").
ALTER TABLE "push_deliveries"
  ADD CONSTRAINT "push_deliveries_url_in_app" CHECK (
    "url" LIKE '/%' AND "url" NOT LIKE '//%' AND position(E'\\' in "url") = 0
    AND char_length("url") <= 512
  );

-- Bounded retries.
ALTER TABLE "push_deliveries"
  ADD CONSTRAINT "push_deliveries_attempts_range" CHECK ("attempts" BETWEEN 0 AND 5);

-- Accepted means the push service said 201, and we know when.
ALTER TABLE "push_deliveries"
  ADD CONSTRAINT "push_deliveries_accepted_dated" CHECK (("status" = 'accepted') = ("accepted_at" IS NOT NULL));

-- Only a leased row carries a lease.
ALTER TABLE "push_deliveries"
  ADD CONSTRAINT "push_deliveries_lease_only_sending" CHECK (("status" = 'sending') = ("lease_until" IS NOT NULL));

-- No CHECK ties a queued row to a live device: deleting a subscription sets
-- subscription_id NULL (keeping the row as a count), and the sender settles any
-- such row as `gone` instead of sending. A CHECK there would make deleting a
-- device fail whenever it had something queued.

-- Plan expiry and two new generation caps (F21 roadmaps, F22 job searches, F23 pay).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- Why this migration exists before either new feature does.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Before this, `payment.captured` raised `users.plan` and nothing ever
-- lowered it — one ₹499 payment granted Pro forever. Both new features are
-- plan-gated (capRoadmaps, capJobSearches), and a gate on a plan that never
-- lapses is not a gate. This migration is the fix, applied before either
-- feature's own cap can be reached on a membership nobody is still paying for.

-- ── two new caps, same shape as the existing four (F15) ─────────────────────
ALTER TABLE "users"
  ADD COLUMN "cap_roadmaps"     INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "cap_job_searches" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "workspace_settings"
  ADD COLUMN "cap_roadmaps"     INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "cap_job_searches" INTEGER NOT NULL DEFAULT 0;

-- Every existing row predates both columns, so every one sits on the DEFAULT
-- above regardless of its plan. Set them once from the plan the row already
-- carries — the same numbers `raisePlan` (below) writes on every purchase
-- from here on, so an existing Pro member is not worse provisioned than a new
-- one signing up today.
UPDATE "users" SET "cap_roadmaps" = 40,  "cap_job_searches" = 60  WHERE "plan" = 'pro';
UPDATE "users" SET "cap_roadmaps" = 150, "cap_job_searches" = 200 WHERE "plan" = 'ultra';

-- ── plan expiry ──────────────────────────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN "plan_expires_at" TIMESTAMPTZ;

-- Generous direction, deliberately: every existing paid row gets a fresh 30
-- days from the moment this migration runs, not from whenever it was last
-- billed (there is no history of that to read — D9 already declined to keep
-- one). Erring toward "you keep the plan a little longer than you strictly
-- paid for" is the same rule the top-up carry logic uses for the same reason
-- (lib/db/queries/tokens.ts#unspentTopups).
UPDATE "users"
   SET "plan_expires_at" = now() + interval '30 days'
 WHERE "plan" <> 'free';

-- ---------------------------------------------------------------------------
-- Hand-added CHECK constraints (CLAUDE.md §13). Prisma has no CHECK
-- attribute; with no test suite these bounds are the guarantee (§11).
--
--   1/2. Same range shape as the other four caps (cycle-period, admin-tunable
--        from the panel). 0 is a real setting — "off" — hence NOT NULL with a
--        range CHECK rather than a nullable column, same as every other cap.
--   3.   A paid plan has an expiry; Free has none. This is what makes
--        `effectivePlan` a pure function of the row instead of a guess: the
--        row itself states whether a lapse is even representable.
-- ---------------------------------------------------------------------------
ALTER TABLE "users" ADD CONSTRAINT "users_cap_roadmaps_range"
  CHECK ("cap_roadmaps" >= 0 AND "cap_roadmaps" <= 200);
ALTER TABLE "users" ADD CONSTRAINT "users_cap_job_searches_range"
  CHECK ("cap_job_searches" >= 0 AND "cap_job_searches" <= 500);

ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_cap_roadmaps_range"
  CHECK ("cap_roadmaps" >= 0 AND "cap_roadmaps" <= 200);
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_cap_job_searches_range"
  CHECK ("cap_job_searches" >= 0 AND "cap_job_searches" <= 500);

ALTER TABLE "users" ADD CONSTRAINT "users_plan_expiry_pairing"
  CHECK (("plan" = 'free') = ("plan_expires_at" IS NULL));

-- ── plan purchase idempotency (G7/G8) ────────────────────────────────────────
-- Exists only so a redelivered `payment.captured` webhook for a payment
-- already applied extends `plan_expires_at` by zero days, not another 30 —
-- the same UNIQUE-reference shape `token_grants` already uses for top-ups.
CREATE TABLE "plan_purchases" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "clerk_user_id" TEXT NOT NULL,
  "plan"          "plan" NOT NULL,
  "reference"     TEXT NOT NULL,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "plan_purchases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_purchases_reference_key" ON "plan_purchases"("reference");
CREATE INDEX "plan_purchases_user_idx" ON "plan_purchases"("clerk_user_id");

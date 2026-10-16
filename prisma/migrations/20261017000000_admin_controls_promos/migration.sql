-- CreateEnum
CREATE TYPE "feature_key" AS ENUM ('jobs', 'portfolio', 'rapid', 'roadmap', 'study', 'rounds');

-- CreateEnum
CREATE TYPE "promo_kind" AS ENUM ('percent', 'flat');

-- CreateEnum
CREATE TYPE "promo_redemption_status" AS ENUM ('pending', 'captured');

-- AlterTable
ALTER TABLE "plan_purchases" ADD COLUMN     "granted_by" TEXT;

-- CreateTable
CREATE TABLE "feature_switches" (
    "key" "feature_key" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "feature_switches_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "plan_configs" (
    "id" "plan" NOT NULL,
    "name" TEXT NOT NULL,
    "price_paise" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "cap_tokens" INTEGER NOT NULL,
    "cap_analyses" INTEGER NOT NULL,
    "cap_resumes" INTEGER NOT NULL,
    "cap_answers" INTEGER NOT NULL,
    "cap_courses" INTEGER NOT NULL,
    "cap_roadmaps" INTEGER NOT NULL,
    "cap_job_searches" INTEGER NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "plan_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "promo_kind" NOT NULL,
    "percent_off" INTEGER,
    "amount_off_paise" INTEGER,
    "plans" "plan"[],
    "starts_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ,
    "max_redemptions" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "show_banner" BOOLEAN NOT NULL DEFAULT true,
    "banner_text" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_redemptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "promo_id" UUID NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "plan" "plan" NOT NULL,
    "order_id" TEXT NOT NULL,
    "list_paise" INTEGER NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "status" "promo_redemption_status" NOT NULL DEFAULT 'pending',
    "payment_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "captured_at" TIMESTAMPTZ,

    CONSTRAINT "promo_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "promo_redemptions_order_id_key" ON "promo_redemptions"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "promo_redemptions_payment_id_key" ON "promo_redemptions"("payment_id");

-- CreateIndex
CREATE INDEX "promo_redemptions_promo_idx" ON "promo_redemptions"("promo_id", "status");

-- CreateIndex
CREATE INDEX "promo_redemptions_user_idx" ON "promo_redemptions"("clerk_user_id");

-- AddForeignKey
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "promo_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-added CHECKs and indexes (CLAUDE.md §11: the constraints are the test
-- suite). Prisma has no syntax for these.
-- ---------------------------------------------------------------------------

-- F31: an admin-assigned plan names its admin; a paid one never does.
ALTER TABLE "plan_purchases"
  ADD CONSTRAINT "plan_purchases_admin_has_granter"
  CHECK (("reference" LIKE 'admin:%') = ("granted_by" IS NOT NULL));

-- F31: what the pricing page prints. Free costs nothing; a paid plan costs at
-- least ₹1, which is Razorpay's floor. Caps share the `users` bounds.
ALTER TABLE "plan_configs"
  ADD CONSTRAINT "plan_configs_price"
  CHECK (("id" = 'free' AND "price_paise" = 0) OR ("id" <> 'free' AND "price_paise" BETWEEN 100 AND 10000000)),
  ADD CONSTRAINT "plan_configs_name_len" CHECK (char_length("name") BETWEEN 1 AND 40),
  ADD CONSTRAINT "plan_configs_unit_len" CHECK (char_length("unit") BETWEEN 1 AND 40),
  ADD CONSTRAINT "plan_configs_tagline_len" CHECK (char_length("tagline") BETWEEN 1 AND 400),
  ADD CONSTRAINT "plan_configs_cta_len" CHECK (char_length("cta") BETWEEN 1 AND 40),
  ADD CONSTRAINT "plan_configs_cap_tokens" CHECK ("cap_tokens" BETWEEN 0 AND 4000000),
  ADD CONSTRAINT "plan_configs_cap_analyses" CHECK ("cap_analyses" BETWEEN 0 AND 200),
  ADD CONSTRAINT "plan_configs_cap_resumes" CHECK ("cap_resumes" BETWEEN 0 AND 11),
  ADD CONSTRAINT "plan_configs_cap_answers" CHECK ("cap_answers" BETWEEN 0 AND 200),
  ADD CONSTRAINT "plan_configs_cap_courses" CHECK ("cap_courses" BETWEEN 0 AND 6),
  ADD CONSTRAINT "plan_configs_cap_roadmaps" CHECK ("cap_roadmaps" BETWEEN 0 AND 200),
  ADD CONSTRAINT "plan_configs_cap_job_searches" CHECK ("cap_job_searches" BETWEEN 0 AND 500);

-- F32: percent XOR flat, never both, never neither. Percent capped at 90 so a
-- code can never make a plan free by accident; flat at least ₹1.
ALTER TABLE "promo_codes"
  ALTER COLUMN "plans" SET NOT NULL,
  ADD CONSTRAINT "promo_codes_code_shape" CHECK ("code" ~ '^[A-Z0-9-]{3,24}$'),
  ADD CONSTRAINT "promo_codes_label_len" CHECK (char_length("label") BETWEEN 1 AND 60),
  ADD CONSTRAINT "promo_codes_banner_len" CHECK ("banner_text" IS NULL OR char_length("banner_text") BETWEEN 1 AND 160),
  ADD CONSTRAINT "promo_codes_discount" CHECK (
    ("kind" = 'percent' AND "percent_off" BETWEEN 1 AND 90 AND "amount_off_paise" IS NULL) OR
    ("kind" = 'flat' AND "amount_off_paise" >= 100 AND "percent_off" IS NULL)
  ),
  ADD CONSTRAINT "promo_codes_plans_nonempty" CHECK (cardinality("plans") > 0 AND NOT ('free' = ANY("plans"))),
  ADD CONSTRAINT "promo_codes_window" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at"),
  ADD CONSTRAINT "promo_codes_max" CHECK ("max_redemptions" IS NULL OR "max_redemptions" > 0);

-- F32: what is charged is never below Razorpay's floor nor above list; a
-- captured row carries its payment, a pending one does not.
ALTER TABLE "promo_redemptions"
  ADD CONSTRAINT "promo_redemptions_amount" CHECK ("amount_paise" >= 100 AND "amount_paise" <= "list_paise"),
  ADD CONSTRAINT "promo_redemptions_captured" CHECK (
    ("status" = 'captured') = ("payment_id" IS NOT NULL AND "captured_at" IS NOT NULL)
  );

-- One captured redemption per member per code.
CREATE UNIQUE INDEX "promo_redemptions_once_per_member"
  ON "promo_redemptions" ("promo_id", "clerk_user_id") WHERE "status" = 'captured';

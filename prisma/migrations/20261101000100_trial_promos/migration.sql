-- Free-trial promo codes (F32.1, 2026-11-01) — part 2 of 2.
--
-- A `trial` code grants `trial_days` of exactly one paid plan with no payment.
-- Redeeming it writes a `granted` promo_redemptions row (order_id `trial:<uuid>`,
-- amount 0, no payment) and a plan_purchases row with the same `trial:`
-- reference — the audit trail N21 (c) asks for. The column is generated
-- (`prisma migrate diff`); the CHECKs, the index and the seed row are
-- hand-added (CLAUDE.md §13 — Prisma has no syntax for them).

-- AlterTable
ALTER TABLE "promo_codes" ADD COLUMN "trial_days" INTEGER;

-- Hand-written below.

-- Exactly one of: percent, flat, or a 1–30 day trial on a single plan.
ALTER TABLE "promo_codes" DROP CONSTRAINT "promo_codes_discount";
ALTER TABLE "promo_codes"
  ADD CONSTRAINT "promo_codes_discount" CHECK (
    ("kind" = 'percent' AND "percent_off" BETWEEN 1 AND 90 AND "amount_off_paise" IS NULL AND "trial_days" IS NULL) OR
    ("kind" = 'flat' AND "amount_off_paise" >= 100 AND "percent_off" IS NULL AND "trial_days" IS NULL) OR
    ("kind" = 'trial' AND "trial_days" BETWEEN 1 AND 30 AND "percent_off" IS NULL AND "amount_off_paise" IS NULL
      AND cardinality("plans") = 1)
  );

-- A granted (trial) redemption charges nothing and names no order; every
-- other row still charges between Razorpay's floor and list.
ALTER TABLE "promo_redemptions" DROP CONSTRAINT "promo_redemptions_amount";
ALTER TABLE "promo_redemptions"
  ADD CONSTRAINT "promo_redemptions_amount" CHECK (
    ("status" = 'granted' AND "amount_paise" = 0 AND "order_id" LIKE 'trial:%') OR
    ("status" <> 'granted' AND "amount_paise" >= 100 AND "amount_paise" <= "list_paise"
      AND "order_id" NOT LIKE 'trial:%')
  );

-- One free trial per member, across every trial code, ever.
CREATE UNIQUE INDEX "promo_redemptions_one_trial_per_member"
  ON "promo_redemptions" ("clerk_user_id") WHERE "status" = 'granted';

-- A trial plan_purchases row names no admin (it was redeemed, not granted by
-- hand) — already implied by plan_purchases_admin_has_granter.

-- HALLOWEN03: three days of Pro, free. Live from now, no end, not capped;
-- an admin can edit or pause it from Admin → Promo codes.
INSERT INTO "promo_codes"
  ("code", "label", "kind", "trial_days", "plans", "starts_at", "show_banner", "banner_text", "created_by")
VALUES
  ('HALLOWEN03', 'Halloween free trial', 'trial', 3, ARRAY['pro']::"plan"[], now(), true,
   'Halloween: try Pro free for 3 days with code HALLOWEN03', 'system:migration')
ON CONFLICT ("code") DO NOTHING;

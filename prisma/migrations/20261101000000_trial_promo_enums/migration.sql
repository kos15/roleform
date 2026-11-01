-- Free-trial promo codes (F32.1, 2026-11-01) — part 1 of 2: enum values.
--
-- In a migration of their own because Postgres refuses to use an enum value
-- in the same transaction that added it; part 2's CHECKs, index and the
-- HALLOWEEN insert all name these values.

-- AlterEnum
ALTER TYPE "promo_kind" ADD VALUE 'trial';

-- AlterEnum
ALTER TYPE "promo_redemption_status" ADD VALUE 'granted';

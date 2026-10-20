-- Counts-only pricing (2026-10-21): `cap_tokens` stops being a number members
-- see and becomes a hidden fair-use ceiling, sized so every printed count
-- binds first (CLAUDE.md N22, amended). GPT-5 reasoning tokens are metered,
-- so the ceilings rise; the bound rises with them.
--
-- Hand-written: no Prisma schema change (CHECKs are outside the schema,
-- CLAUDE.md §13), only constraint bounds and a one-off raise.

ALTER TABLE "users" DROP CONSTRAINT "users_cap_tokens_range";
ALTER TABLE "users" ADD CONSTRAINT "users_cap_tokens_range"
  CHECK ("cap_tokens" >= 0 AND "cap_tokens" <= 30000000);

ALTER TABLE "workspace_settings" DROP CONSTRAINT "workspace_settings_cap_tokens_range";
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_cap_tokens_range"
  CHECK ("cap_tokens" >= 0 AND "cap_tokens" <= 30000000);

ALTER TABLE "plan_configs" DROP CONSTRAINT "plan_configs_cap_tokens";
ALTER TABLE "plan_configs" ADD CONSTRAINT "plan_configs_cap_tokens"
  CHECK ("cap_tokens" BETWEEN 0 AND 30000000);

-- Raise, never lower: GREATEST keeps any ceiling an admin already set higher.
-- Numbers = lib/content/pricing.ts PLANS (fairUseCeiling over the printed counts).
UPDATE "users" SET "cap_tokens" = GREATEST("cap_tokens", 530000)   WHERE "plan" = 'free';
UPDATE "users" SET "cap_tokens" = GREATEST("cap_tokens", 6960000)  WHERE "plan" = 'pro';
UPDATE "users" SET "cap_tokens" = GREATEST("cap_tokens", 26400000) WHERE "plan" = 'ultra';
UPDATE "plan_configs" SET "cap_tokens" = GREATEST("cap_tokens", 530000)   WHERE "id" = 'free';
UPDATE "plan_configs" SET "cap_tokens" = GREATEST("cap_tokens", 6960000)  WHERE "id" = 'pro';
UPDATE "plan_configs" SET "cap_tokens" = GREATEST("cap_tokens", 26400000) WHERE "id" = 'ultra';
UPDATE "workspace_settings" SET "cap_tokens" = GREATEST("cap_tokens", 530000);

-- New rows start on Free's ceiling (generated).
-- AlterTable
ALTER TABLE "users" ALTER COLUMN "cap_tokens" SET DEFAULT 530000;
-- AlterTable
ALTER TABLE "workspace_settings" ALTER COLUMN "cap_tokens" SET DEFAULT 530000;

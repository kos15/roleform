-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cap_practice" INTEGER NOT NULL DEFAULT 3;
-- AlterTable
ALTER TABLE "workspace_settings" ADD COLUMN     "cap_practice" INTEGER NOT NULL DEFAULT 3;
-- AlterTable
ALTER TABLE "plan_configs" ADD COLUMN     "cap_practice" INTEGER NOT NULL DEFAULT 3;

-- Practice sessions (counts-only pricing, 2026-10-21). Rapid prep was metered
-- only in tokens; with tokens no longer shown to members it needs a printed
-- count of its own (N22). Existing rows sit on the DEFAULT above whatever
-- their plan, so set them once from the plan they carry — the numbers
-- `PLANS` writes on every purchase from here on.
UPDATE "users" SET "cap_practice" = 40  WHERE "plan" = 'pro';
UPDATE "users" SET "cap_practice" = 150 WHERE "plan" = 'ultra';
UPDATE "plan_configs" SET "cap_practice" = 40  WHERE "id" = 'pro';
UPDATE "plan_configs" SET "cap_practice" = 150 WHERE "id" = 'ultra';

-- Bounds mirror lib/domain/quotas.ts (hand-added CHECKs, CLAUDE.md §13).
ALTER TABLE "users" ADD CONSTRAINT "users_cap_practice" CHECK ("cap_practice" BETWEEN 0 AND 200);
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_cap_practice" CHECK ("cap_practice" BETWEEN 0 AND 200);
ALTER TABLE "plan_configs" ADD CONSTRAINT "plan_configs_cap_practice" CHECK ("cap_practice" BETWEEN 0 AND 200);

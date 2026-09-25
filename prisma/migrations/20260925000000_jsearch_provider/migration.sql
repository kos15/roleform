-- JSearch job source (docs/prd-jsearch.md). Purely additive: one new enum
-- value, no table change, no backfill — safe on every deploy.
--
-- AlterEnum
ALTER TYPE "job_provider" ADD VALUE 'jsearch';

-- Job search triage (F22.1): a third documented-API source (freehire), the
-- provider facts it returns that the triage reads (skills, work mode, the
-- posting's own minimum years, repost / mass-posting counts, the salary
-- period, the full description), the recency window a search asked for, and
-- a per-source report of counts and status codes so a cached read shows the
-- same source health the original search did. No model call anywhere on this
-- path (N13). Generated with `prisma migrate diff`; the CHECK block at the end
-- is added by hand (CLAUDE.md §13), like every CHECK before it.
-- AlterEnum
ALTER TYPE "job_provider" ADD VALUE 'freehire';

-- AlterTable
ALTER TABLE "job_listings" ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "mass_posting_count" INTEGER,
ADD COLUMN     "min_years" INTEGER,
ADD COLUMN     "repost_count" INTEGER,
ADD COLUMN     "salary_period" TEXT,
ADD COLUMN     "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "work_mode" TEXT;

-- AlterTable
ALTER TABLE "job_searches" ADD COLUMN     "posted_within_days" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "source_report" JSONB NOT NULL DEFAULT '[]';


-- ------------------------------------------------------------ hand-added CHECKs
-- 0 means "any date"; otherwise the window is the member's own choice, capped
-- at a year so a typo can't widen it past what a cache entry means.
ALTER TABLE "job_searches" ADD CONSTRAINT "job_searches_posted_within_days_range"
  CHECK ("posted_within_days" >= 0 AND "posted_within_days" <= 365);

-- The provider's own vocabulary, normalised by the adapter; anything else is
-- dropped to null there rather than stored as a fourth mode.
ALTER TABLE "job_listings" ADD CONSTRAINT "job_listings_work_mode_vocab"
  CHECK ("work_mode" IS NULL OR "work_mode" IN ('remote', 'hybrid', 'onsite'));

ALTER TABLE "job_listings" ADD CONSTRAINT "job_listings_min_years_range"
  CHECK ("min_years" IS NULL OR ("min_years" >= 0 AND "min_years" <= 40));

ALTER TABLE "job_listings" ADD CONSTRAINT "job_listings_repost_counts_nonneg"
  CHECK (("repost_count" IS NULL OR "repost_count" >= 0)
     AND ("mass_posting_count" IS NULL OR "mass_posting_count" >= 0));

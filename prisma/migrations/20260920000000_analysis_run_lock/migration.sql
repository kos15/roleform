-- Analysis run lock. Purely additive, nullable, no backfill, no CHECK — safe
-- on every deploy.
--
-- A reload of the parsing screen while a run is still in flight re-POSTs
-- `/api/analyze/[id]` for an analysis still `parsing`, starting a SECOND,
-- genuinely concurrent `runAnalysis` invocation. The existing "resume, not
-- restart" logic only guards a retry after the first attempt ended — it does
-- nothing for two invocations racing each other, and `jd_requirements`,
-- `coverage_items` and `interview_questions` carry no unique constraint, so
-- both would write their rows and every one of them would show up twice.
--
-- `running_at` is the atomic claim that closes that race (lib/pipeline/run-
-- analysis.ts): a single `UPDATE ... WHERE running_at IS NULL OR running_at <
-- <stale cutoff>` either claims the row or it doesn't, with no window between
-- a read and a write for a second invocation to land in.

-- AlterTable
ALTER TABLE "analyses" ADD COLUMN "running_at" TIMESTAMPTZ;

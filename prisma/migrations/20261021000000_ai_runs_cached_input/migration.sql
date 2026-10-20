-- AlterTable
ALTER TABLE "ai_runs" ADD COLUMN     "cached_input_tokens" INTEGER NOT NULL DEFAULT 0;

-- A cached count is part of the input count, never more (hand-added CHECK, CLAUDE.md §13).
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_cached_input_check" CHECK ("cached_input_tokens" >= 0 AND "cached_input_tokens" <= "input_tokens");

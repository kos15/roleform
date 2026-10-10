-- Portfolio sites (F28). One in-app portfolio build per account: the UNIQUE
-- key on clerk_user_id is the trial limit, and the own-rows RLS policy in
-- lib/db/policies.sql covers the table (N10).

-- CreateEnum
CREATE TYPE "portfolio_status" AS ENUM ('building', 'ready');

-- CreateTable
CREATE TABLE "portfolio_sites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "master_profile_id" UUID,
    "analysis_id" UUID,
    "status" "portfolio_status" NOT NULL DEFAULT 'building',
    "choices" JSONB NOT NULL DEFAULT '{}',
    "html" TEXT,
    "ai_run_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_sites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_sites_user" ON "portfolio_sites"("clerk_user_id");

-- AddForeignKey
ALTER TABLE "portfolio_sites" ADD CONSTRAINT "portfolio_sites_master_profile_id_fkey" FOREIGN KEY ("master_profile_id") REFERENCES "master_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_sites" ADD CONSTRAINT "portfolio_sites_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_sites" ADD CONSTRAINT "portfolio_sites_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-added CHECK (CLAUDE.md §11: a constraint over a validation function).
-- ---------------------------------------------------------------------------

-- A finished build has its page; a reservation has none. Never a "ready" row
-- that serves an empty document, nor a "building" one holding a stale page.
ALTER TABLE "portfolio_sites" ADD CONSTRAINT "portfolio_sites_html_when_ready"
  CHECK ((("status" = 'ready') = ("html" IS NOT NULL)) AND ("html" IS NULL OR length("html") > 0));

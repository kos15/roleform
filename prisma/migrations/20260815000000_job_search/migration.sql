-- Job search (F22). Listings from documented job-board APIs only (N17) —
-- never scraped, never an employer's page fetched.
--
-- `job_listings` is a shared cache carrying no `clerk_user_id`: the listing
-- is public content, and the pairing of a listing with a person lives only in
-- `saved_jobs`, which IS scoped (JS-5/JS-9). RLS on `job_listings` and
-- `job_search_hits` is enabled with no policy at all — the same shape
-- `unresolved_terms` and `corpus_gaps` already use — because nothing an anon
-- or authenticated request has any business reading them directly; every
-- read is a Server Action joining through `saved_jobs` or a fresh search.

-- CreateEnum
CREATE TYPE "job_provider" AS ENUM ('adzuna', 'jooble');

CREATE TYPE "saved_job_status" AS ENUM
  ('saved', 'applied', 'interviewing', 'offer', 'rejected', 'closed');

-- CreateTable
CREATE TABLE "job_listings" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "source"      "job_provider" NOT NULL,
  "external_id" TEXT NOT NULL,
  "url"         TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "company"     TEXT NOT NULL,
  "location"    TEXT NOT NULL,
  "snippet"     TEXT NOT NULL,
  "posted_at"   TIMESTAMPTZ,
  "salary_min"  INTEGER,
  "salary_max"  INTEGER,
  "currency"    TEXT,
  "raw"         JSONB NOT NULL DEFAULT '{}',
  "fetched_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at"  TIMESTAMPTZ NOT NULL,

  CONSTRAINT "job_listings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_listings_source_external_id" ON "job_listings"("source", "external_id");
CREATE INDEX "job_listings_expires_idx" ON "job_listings"("expires_at");

-- CreateTable
CREATE TABLE "job_searches" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "clerk_user_id" TEXT NOT NULL,
  "query_hash"    TEXT NOT NULL,
  "titles"        TEXT[] NOT NULL DEFAULT '{}',
  "location"      TEXT NOT NULL DEFAULT '',
  "remote"        BOOLEAN NOT NULL DEFAULT false,
  "result_count"  INTEGER NOT NULL DEFAULT 0,
  "sources"       TEXT[] NOT NULL DEFAULT '{}',
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "job_searches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "job_searches_clerk_user_id_fkey" FOREIGN KEY ("clerk_user_id")
    REFERENCES "users"("clerk_user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- The cache-reuse lookup (JS-4: a repeat query inside the window costs no cap)
-- and the cap-counting lookup (rows created since cycleStart) are the same
-- index read two ways.
CREATE INDEX "job_searches_cache_idx" ON "job_searches"("clerk_user_id", "query_hash", "created_at");
CREATE INDEX "job_searches_user_created_idx" ON "job_searches"("clerk_user_id", "created_at");

-- CreateTable
CREATE TABLE "job_search_hits" (
  "search_id"  UUID NOT NULL,
  "listing_id" UUID NOT NULL,
  "rank"       INTEGER NOT NULL,

  CONSTRAINT "job_search_hits_pkey" PRIMARY KEY ("search_id", "listing_id"),
  CONSTRAINT "job_search_hits_search_id_fkey" FOREIGN KEY ("search_id")
    REFERENCES "job_searches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "job_search_hits_listing_id_fkey" FOREIGN KEY ("listing_id")
    REFERENCES "job_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "saved_jobs" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "clerk_user_id" TEXT NOT NULL,
  "listing_id"    UUID NOT NULL,
  "analysis_id"   UUID,
  "status"        "saved_job_status" NOT NULL DEFAULT 'saved',
  "applied_at"    TIMESTAMPTZ,
  "note"          TEXT NOT NULL DEFAULT '',
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "saved_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "saved_jobs_clerk_user_id_fkey" FOREIGN KEY ("clerk_user_id")
    REFERENCES "users"("clerk_user_id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- Restrict, not Cascade (JS-10): a saved job outlives the listing cache's
  -- 30-day expiry sweep. The sweep is read-filtered (`expires_at > now()`),
  -- never a delete, so this FK is never actually exercised by it — it exists
  -- to make that promise a database fact rather than a comment.
  CONSTRAINT "saved_jobs_listing_id_fkey" FOREIGN KEY ("listing_id")
    REFERENCES "job_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "saved_jobs_analysis_id_fkey" FOREIGN KEY ("analysis_id")
    REFERENCES "analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "saved_jobs_user_listing" ON "saved_jobs"("clerk_user_id", "listing_id");
CREATE INDEX "saved_jobs_user_updated_idx" ON "saved_jobs"("clerk_user_id", "updated_at");

-- ---------------------------------------------------------------------------
-- Hand-added CHECK (CLAUDE.md §13): "applied" without a date is a status
-- nobody can trust — the same shape as `contact_messages_handled_pair`.
-- ---------------------------------------------------------------------------
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_applied_has_date"
  CHECK ("status" <> 'applied' OR "applied_at" IS NOT NULL);

-- ── the hand-off from a listing into an analysis (F22 §3.5) ─────────────────
ALTER TABLE "analyses" ADD COLUMN "listing_id" UUID;
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "job_listings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

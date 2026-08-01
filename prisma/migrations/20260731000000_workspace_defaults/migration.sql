-- CreateTable
CREATE TABLE "workspace_settings" (
    "id" TEXT NOT NULL DEFAULT 'workspace',
    "cap_analyses" INTEGER NOT NULL DEFAULT 40,
    "cap_resumes" INTEGER NOT NULL DEFAULT 6,
    "cap_answers" INTEGER NOT NULL DEFAULT 40,
    "cap_courses" INTEGER NOT NULL DEFAULT 4,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "workspace_settings_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Hand-added CHECK constraints (CLAUDE.md §13).
--
-- The same bounds as the per-member caps on "users", for the same reason: a
-- default outside the range a member's own cap is allowed to hold would be a
-- number that can never be applied. 0 stays legal here too — a workspace that
-- provisions new accounts with generation off is a real choice.
-- ---------------------------------------------------------------------------
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_cap_analyses_range"
  CHECK ("cap_analyses" >= 0 AND "cap_analyses" <= 200);
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_cap_resumes_range"
  CHECK ("cap_resumes" >= 0 AND "cap_resumes" <= 6);
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_cap_answers_range"
  CHECK ("cap_answers" >= 0 AND "cap_answers" <= 200);
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_cap_courses_range"
  CHECK ("cap_courses" >= 0 AND "cap_courses" <= 6);

-- One row, enforced rather than remembered.
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_singleton"
  CHECK ("id" = 'workspace');

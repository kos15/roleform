-- Eleven templates (design v2.7).
--
-- Five new families — Keystone, Throughline, Blueprint, Marque, Beacon — none
-- of them a recolour of an existing one. `template_kind` grows from three
-- values to eight.
--
-- Postgres will not add an enum value inside a transaction that then USES it,
-- and Prisma wraps a migration in one. Splitting the ALTER TYPE statements into
-- their own migration keeps that rule satisfied: nothing here reads the new
-- values, and the seed script writes them afterwards over its own connection.

ALTER TYPE "template_kind" ADD VALUE IF NOT EXISTS 'banner';
ALTER TYPE "template_kind" ADD VALUE IF NOT EXISTS 'timeline';
ALTER TYPE "template_kind" ADD VALUE IF NOT EXISTS 'modular';
ALTER TYPE "template_kind" ADD VALUE IF NOT EXISTS 'editorial';
ALTER TYPE "template_kind" ADD VALUE IF NOT EXISTS 'infographic';

-- The per-member résumé cap was bounded at six because six was every template
-- there was. Eleven now exist, and a member capped at six would silently lose
-- five — including two of the three High-ATS layouts.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_cap_resumes_range";
ALTER TABLE "users"
  ADD CONSTRAINT "users_cap_resumes_range"
  CHECK ("cap_resumes" >= 0 AND "cap_resumes" <= 11);

ALTER TABLE "workspace_settings" DROP CONSTRAINT IF EXISTS "workspace_settings_cap_resumes_range";
ALTER TABLE "workspace_settings"
  ADD CONSTRAINT "workspace_settings_cap_resumes_range"
  CHECK ("cap_resumes" >= 0 AND "cap_resumes" <= 11);

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('member', 'admin');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cap_analyses" INTEGER NOT NULL DEFAULT 40,
ADD COLUMN     "cap_answers" INTEGER NOT NULL DEFAULT 40,
ADD COLUMN     "cap_courses" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "cap_resumes" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "role" "user_role" NOT NULL DEFAULT 'member',
ADD COLUMN     "suspended" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_messages_created_idx" ON "contact_messages"("created_at");

-- ---------------------------------------------------------------------------
-- Hand-added CHECK constraints (CLAUDE.md §13).
--
-- Prisma has no CHECK attribute, and with no test suite these bounds are the
-- only thing standing between a mistyped cap and a member silently getting
-- either nothing or the whole budget. Written once, never touched again.
--
-- 0 is legal everywhere: "off" is a setting an admin is allowed to choose, and
-- the UI renders it as "Off" rather than a number. The upper bounds are facts
-- about the product, not policy — there are exactly six templates, and a gap
-- with more than six course matches is a list nobody reads.
-- ---------------------------------------------------------------------------
ALTER TABLE "users" ADD CONSTRAINT "users_cap_analyses_range"
  CHECK ("cap_analyses" >= 0 AND "cap_analyses" <= 200);
ALTER TABLE "users" ADD CONSTRAINT "users_cap_resumes_range"
  CHECK ("cap_resumes" >= 0 AND "cap_resumes" <= 6);
ALTER TABLE "users" ADD CONSTRAINT "users_cap_answers_range"
  CHECK ("cap_answers" >= 0 AND "cap_answers" <= 200);
ALTER TABLE "users" ADD CONSTRAINT "users_cap_courses_range"
  CHECK ("cap_courses" >= 0 AND "cap_courses" <= 6);

-- A support message with no body is a support message nobody can answer.
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_answerable"
  CHECK (length(btrim("email")) > 0 AND length(btrim("body")) > 0);

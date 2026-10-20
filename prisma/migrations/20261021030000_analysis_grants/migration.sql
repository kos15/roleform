-- CreateEnum
CREATE TYPE "analysis_grant_source" AS ENUM ('purchase', 'admin', 'token_conversion');
-- AlterTable
ALTER TABLE "analyses" ADD COLUMN     "from_bonus" BOOLEAN NOT NULL DEFAULT false;
-- CreateTable
CREATE TABLE "analysis_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "analyses" INTEGER NOT NULL,
    "source" "analysis_grant_source" NOT NULL,
    "reference" TEXT NOT NULL,
    "granted_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "analysis_grants_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "analysis_grants_reference_key" ON "analysis_grants"("reference");
-- CreateIndex
CREATE INDEX "analysis_grants_user_idx" ON "analysis_grants"("clerk_user_id");
-- AddForeignKey
ALTER TABLE "analysis_grants" ADD CONSTRAINT "analysis_grants_clerk_user_id_fkey" FOREIGN KEY ("clerk_user_id") REFERENCES "users"("clerk_user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A pack adds at least one analysis (hand-added CHECK, CLAUDE.md §13).
ALTER TABLE "analysis_grants" ADD CONSTRAINT "analysis_grants_positive" CHECK ("analyses" > 0);
-- A purchase has no granting admin; an admin grant always names one.
ALTER TABLE "analysis_grants" ADD CONSTRAINT "analysis_grants_granted_by" CHECK (("source" = 'admin') = ("granted_by" IS NOT NULL));

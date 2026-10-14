-- Employer job boards as sources (F22.2): Greenhouse, Lever and Ashby, each
-- through its vendor's documented, public, keyless job-board API. Only the
-- enum changes — the columns F22.1 added already carry everything a board
-- posting has. Generated with `prisma migrate diff`.
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "job_provider" ADD VALUE 'greenhouse';
ALTER TYPE "job_provider" ADD VALUE 'lever';
ALTER TYPE "job_provider" ADD VALUE 'ashby';


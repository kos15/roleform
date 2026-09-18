import "server-only";
import { db } from "@/lib/db";
import type { SavedJobStatus } from "@/lib/generated/prisma/enums";

export interface SavedJobView {
  id: string;
  listingId: string;
  title: string;
  company: string;
  location: string;
  url: string;
  status: SavedJobStatus;
  appliedAt: Date | null;
  note: string;
  analysisId: string | null;
  updatedAt: Date;
}

/**
 * A member's saved jobs, newest-touched first. Reads at any cap, including
 * Off (JS-10) — this is a tracker of the member's own rows, not a search.
 */
export async function listSavedJobs(clerkUserId: string): Promise<SavedJobView[]> {
  const rows = await db.savedJob.findMany({
    where: { clerkUserId },
    orderBy: { updatedAt: "desc" },
    include: { listing: { select: { title: true, company: true, location: true, url: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    listingId: row.listingId,
    title: row.listing.title,
    company: row.listing.company,
    location: row.listing.location,
    url: row.listing.url,
    status: row.status,
    appliedAt: row.appliedAt,
    note: row.note,
    analysisId: row.analysisId,
    updatedAt: row.updatedAt,
  }));
}

/**
 * The listing a saved job points at — used by the analyse hand-off
 * (F22 §3.5) to pre-fill the snippet. Scoped by clerkUserId through the
 * saved_jobs row, since job_listings itself carries no user id (JS-9).
 */
export async function getSavedJobListing(clerkUserId: string, savedJobId: string) {
  const row = await db.savedJob.findFirst({
    where: { id: savedJobId, clerkUserId },
    select: {
      id: true,
      listingId: true,
      listing: { select: { title: true, company: true, snippet: true, url: true } },
    },
  });
  return row;
}

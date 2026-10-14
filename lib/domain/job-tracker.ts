/**
 * The saved-jobs tracker's derived hints (F22.1, R24/R31/R32). PURE.
 *
 * Hints are shown beside a saved job, never written onto it: a status is the
 * member's own fact (N3, N15's rule applied here), and nothing below moves
 * it. No drafting — a follow-up message would need a model (N13); the hint
 * says when one is normal, and the member writes it.
 */

const DAY = 86_400_000;
/** The reference's own threshold: ten quiet days after applying (R31). */
export const FOLLOW_UP_AFTER_DAYS = 10;
const STALE_LISTING_DAYS = 30;

export interface TrackedJob {
  status: "saved" | "applied" | "interviewing" | "offer" | "rejected" | "closed";
  appliedAt: Date | null;
  updatedAt: Date;
  postedAt: Date | null;
  listingExpiresAt: Date;
}

export function trackerHints(job: TrackedJob, now: Date = new Date()): string[] {
  const hints: string[] = [];

  if (job.status === "applied" && job.appliedAt) {
    // Quiet since whichever came later: the application, or the last change.
    const lastTouch = Math.max(job.appliedAt.getTime(), job.updatedAt.getTime());
    const quiet = Math.floor((now.getTime() - lastTouch) / DAY);
    if (quiet >= FOLLOW_UP_AFTER_DAYS) {
      hints.push(`No word in ${quiet} days — a short follow-up is normal now.`);
    }
  }

  if (job.status === "saved") {
    if (job.listingExpiresAt <= now) {
      hints.push("We haven't seen this listing in a search for 30 days — it may have closed.");
    } else if (job.postedAt) {
      const age = Math.floor((now.getTime() - job.postedAt.getTime()) / DAY);
      if (age > STALE_LISTING_DAYS) hints.push(`Posted ${age} days ago — check it's still open.`);
    }
  }

  return hints;
}

export const TRACKER_STATUSES = ["saved", "applied", "interviewing", "offer", "rejected", "closed"] as const;

/** `n saved · n applied …` — counts per status, in tracker order, zeros left out (N16: a count, never a rate). */
export function statusCounts(jobs: Array<{ status: TrackedJob["status"] }>): Array<{ status: TrackedJob["status"]; n: number }> {
  return TRACKER_STATUSES.map((status) => ({ status, n: jobs.filter((j) => j.status === status).length })).filter(
    (c) => c.n > 0,
  );
}

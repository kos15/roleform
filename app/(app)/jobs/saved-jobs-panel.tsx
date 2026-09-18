import Link from "next/link";
import { Card } from "@/components/ui";
import { SavedStatus } from "./saved-status";
import type { SavedJobView } from "@/lib/db/queries/jobs";

/**
 * The tracker. Reads at any cap, including Off (JS-10) — a saved job
 * outlives the search that found it.
 */
export function SavedJobsPanel({ jobs }: { jobs: SavedJobView[] }) {
  if (jobs.length === 0) {
    return (
      <div>
        <h2 className="mb-2 text-[1.1rem]">Saved</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Nothing saved yet. Save a listing above to track it here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-3 text-[1.1rem]">Saved</h2>
      <div className="space-y-3">
        {jobs.map((job) => (
          <Card key={job.id} className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <a href={job.url} target="_blank" rel="noopener nofollow" className="font-semibold">
                {job.title}
              </a>
              <p className="text-sm text-[var(--color-text-muted)]">
                {job.company || "—"} · {job.location || "—"}
              </p>
              {job.analysisId ? (
                <Link href={`/analysis/${job.analysisId}`} className="text-xs underline">
                  View analysis
                </Link>
              ) : (
                <Link href={`/analyze?listing=${job.listingId}`} className="text-xs underline">
                  Analyse this listing
                </Link>
              )}
            </div>
            <SavedStatus savedJobId={job.id} status={job.status} />
          </Card>
        ))}
      </div>
    </div>
  );
}

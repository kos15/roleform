import Link from "next/link";
import { Clock } from "lucide-react";
import { Card } from "@/components/ui";
import { statusCounts } from "@/lib/domain/job-tracker";
import { SavedStatus } from "./saved-status";
import { SavedNote } from "./saved-note";
import type { SavedJobView } from "@/lib/db/queries/jobs";

/**
 * The tracker. Reads at any cap, including Off (JS-10) — a saved job
 * outlives the search that found it.
 *
 * F22.1: counts per status (a count, never a rate — N16), the member's own
 * note, and hints derived on read — a follow-up after ten quiet days, a
 * listing that may have closed — shown beside a job, never written onto it.
 */
export function SavedJobsPanel({ jobs }: { jobs: SavedJobView[] }) {
  if (jobs.length === 0) {
    return (
      <div>
        <h2 className="mb-4 text-[40px] leading-none">Saved</h2>
        <p className="text-[15px] text-[var(--color-text-muted)]">
          Nothing saved yet. Save a listing above to track it here.
        </p>
      </div>
    );
  }

  const counts = statusCounts(jobs);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-[40px] leading-none">Saved</h2>
        <p className="text-[14px] capitalize text-[var(--color-text-muted)]">
          {counts.map((c) => `${c.n} ${c.status}`).join(" · ")}
        </p>
      </div>
      <div className="space-y-3">
        {jobs.map((job) => (
          <Card key={job.id} className="rounded-[22px] px-[22px] py-[18px]">
            <div className="flex flex-wrap items-center justify-between gap-3.5">
              <div className="min-w-0 flex-[1_1_16rem]">
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener nofollow"
                  className="text-base font-extrabold no-underline"
                >
                  {job.title}
                </a>
                <p className="mb-1.5 mt-0.5 text-sm text-[var(--color-text-muted)]">
                  {job.company || "—"} · {job.location || "—"}
                  {job.appliedAt
                    ? ` · applied ${job.appliedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                    : ""}
                </p>
                {job.analysisId ? (
                  <Link href={`/analysis/${job.analysisId}`} className="text-[13px] font-bold">
                    View analysis
                  </Link>
                ) : (
                  <Link href={`/analyze?listing=${job.listingId}`} className="text-[13px] font-bold">
                    Analyse this listing
                  </Link>
                )}
              </div>
              <SavedStatus savedJobId={job.id} status={job.status} />
            </div>
            {job.hints.length > 0 ? (
              <ul className="mt-3 space-y-1 text-[13.5px] text-[var(--color-accent-700)]">
                {job.hints.map((hint) => (
                  <li key={hint} className="flex items-start gap-2">
                    <Clock className="lucide mt-[3px] h-3.5 w-3.5 flex-none" aria-hidden />
                    <span>{hint}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <SavedNote savedJobId={job.id} note={job.note} />
          </Card>
        ))}
      </div>
    </div>
  );
}

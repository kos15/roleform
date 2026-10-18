import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { listAnalyses } from "@/lib/db/queries/analysis";
import type { AnalysisStatus } from "@/lib/generated/prisma/enums";
import { Card, EmptyState, Tag } from "@/components/ui";
import { UpcomingRounds } from "@/components/upcoming-rounds";

/**
 * F10 — History.
 *
 * Opens stored results: no regeneration, no re-billing. Master profile edits
 * never rewrite past analyses, because original_text is snapshotted on every
 * tailored bullet (specs §6.2 invariant 4).
 */
/** The enum is a database value; the table shows a written label. */
const STATUS_LABEL: Record<AnalysisStatus, string> = {
  parsing: "Analysing",
  ready: "Ready",
  failed: "Failed",
};

export default async function HistoryPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const rows = await listAnalyses(userId);

  if (rows.length === 0) {
    return <EmptyState title="No analyses yet">Paste a posting and we&rsquo;ll start one.</EmptyState>;
  }

  return (
    <section>
      <div className="mb-[clamp(1.5rem,3vw,2.25rem)] flex flex-wrap items-end justify-between gap-[18px]">
        <h1 className="text-[clamp(2.75rem,8vw,7.75rem)]">History</h1>
        <Link href="/analyze" className="btn btn-primary min-h-[50px] px-6 no-underline">
          New analysis
        </Link>
      </div>
      {/* F29.1: every booked round across postings, soonest first. */}
      <UpcomingRounds clerkUserId={userId} />
      {/* Phones get a list, not a table that scrolls sideways. */}
      <ul className="grid grid-cols-1 gap-2.5 sm:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/analysis/${row.id}`}
              className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)] px-4 py-3.5 no-underline"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-extrabold">{row.title ?? "Untitled posting"}</span>
                <span className="block truncate text-xs text-[var(--color-text-muted)]">
                  {row.company ?? "—"} ·{" "}
                  {row.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              </span>
              {row.score ? (
                <span className="display flex-none text-xl">{Number(row.score).toFixed(0)}</span>
              ) : null}
              <Tag className="flex-none" tone={statusTone(row)}>
                {row.queuedAt ? "Parked" : STATUS_LABEL[row.status]}
              </Tag>
            </Link>
          </li>
        ))}
      </ul>
      <Card className="hidden overflow-hidden rounded-[26px] p-0 sm:block">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Role</th>
                <th scope="col">Company</th>
                <th scope="col">Match</th>
                <th scope="col">Status</th>
                <th scope="col">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link
                      href={`/analysis/${row.id}`}
                      className="font-extrabold decoration-[var(--color-line-strong)]"
                    >
                      {row.title ?? "Untitled posting"}
                    </Link>
                  </td>
                  <td>{row.company ?? "—"}</td>
                  <td className="display text-2xl">{row.score ? Number(row.score).toFixed(0) : "—"}</td>
                  <td>
                    <Tag
                      className="min-h-[30px] px-3 font-extrabold"
                      tone={statusTone(row)}
                    >
                      {row.queuedAt ? "Parked" : STATUS_LABEL[row.status]}
                    </Tag>
                  </td>
                  <td className="text-[var(--color-text-muted)]">
                    {row.createdAt.toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="more-copy mt-[18px] max-w-[64ch] text-sm leading-relaxed text-[var(--color-text-muted)]">
        Opening a past analysis is free. Profile edits never rewrite these.
      </p>
    </section>
  );
}

function statusTone(row: { queuedAt: Date | null; status: AnalysisStatus }) {
  if (row.queuedAt) return "default" as const;
  return row.status === "ready" ? ("ink" as const) : row.status === "failed" ? ("pink" as const) : ("warn" as const);
}

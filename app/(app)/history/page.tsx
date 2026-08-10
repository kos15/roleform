import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { listAnalyses } from "@/lib/db/queries/analysis";
import type { AnalysisStatus } from "@/lib/generated/prisma/enums";
import { Card, EmptyState, Tag } from "@/components/ui";

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
      <h1 className="mb-6">History</h1>
      <Card className="p-0">
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
                    <Link href={`/analysis/${row.id}`} className="font-semibold text-accent-body">
                      {row.title ?? "Untitled posting"}
                    </Link>
                  </td>
                  <td>{row.company ?? "—"}</td>
                  <td>{row.score ? Number(row.score).toFixed(0) : "—"}</td>
                  <td>
                    <Tag
                      tone={row.status === "ready" ? "sage" : row.status === "failed" ? "accent" : "muted"}
                    >
                      {STATUS_LABEL[row.status]}
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
    </section>
  );
}

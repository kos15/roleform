import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getAnalysis, getDrafts } from "@/lib/db/queries/analysis";
import { templateById } from "@/lib/render/templates";
import { AtsBadge, Card, EmptyState, Tag } from "@/components/ui";
import { TemplateThumb } from "@/components/template-thumb";
import { DownloadAll } from "./download-all";

/**
 * F5 — Tab 1: "N drafts, same evidence".
 *
 * The heading counts the drafts that exist rather than naming a number. How
 * many render is `capResumes` per member (F15, 0–11), so "six" was wrong for
 * everyone the moment the catalog grew past it.
 *
 * The ATS badge on each card is computed (N5). A creative template reads Low
 * here and that is correct — the badge is how we ship them honestly.
 */
export default async function ResumesTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/");

  // A tab of a run that isn't finished renders without the header or the tab
  // bar — the layout only draws those for a `ready` analysis — which left a
  // page with no score, no tabs and no way back. The run's own screen is the
  // right place to be until there is something to tab between.
  const [analysis, drafts] = await Promise.all([getAnalysis(userId, id), getDrafts(userId, id)]);
  if (!analysis) redirect("/history");
  if (analysis.status !== "ready") redirect(`/analysis/${id}`);

  if (drafts.length === 0) {
    return (
      <EmptyState title="The drafts didn't generate">
        Your match and the other tabs are unaffected. A failure on one surface never takes the
        rest of the analysis with it.
      </EmptyState>
    );
  }

  const summary = drafts[0].changes[0] ?? "";

  return (
    <section>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-[720px]">
          <h2 className="mb-2.5">
            {drafts.length} draft{drafts.length === 1 ? "" : "s"}, same evidence
          </h2>
          {summary ? (
            <p className="text-base leading-relaxed text-[var(--color-text-muted)]">{summary}</p>
          ) : null}
        </div>
        <DownloadAll analysisId={id} />
      </div>

      <div
        data-tour="shelf"
        className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(238px,100%),1fr))]"
      >
        {drafts.map((draft) => {
          const template = templateById(draft.templateId);
          if (!template) return null;
          return (
            <Link
              key={draft.id}
              href={`/analysis/${id}/preview/${draft.templateId}`}
              className="no-underline"
            >
              <Card className="card-link flex h-full flex-col gap-3.5 px-3.5 pb-[18px] pt-3.5">
                <TemplateThumb template={template} />
                <div className="px-1.5">
                  <h3 className="mb-1.5 text-[19px]">{template.name}</h3>
                  <p className="text-sm leading-normal text-[var(--color-text-muted)]">{template.blurb}</p>
                </div>
                <div className="mt-auto flex flex-wrap gap-1.5 px-1.5">
                  <Tag tone="muted">{draft.pageCount} page{draft.pageCount === 1 ? "" : "s"}</Tag>
                  <Tag tone="outline" className="border-[var(--color-line-strong)] capitalize">
                    {template.kind}
                  </Tag>
                  <AtsBadge rating={draft.atsRating} />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

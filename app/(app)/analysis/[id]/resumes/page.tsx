import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getDrafts } from "@/lib/db/queries/analysis";
import { templateById } from "@/lib/render/templates";
import { AtsBadge, Card, EmptyState, Tag } from "@/components/ui";
import { TemplateThumb } from "@/components/template-thumb";
import { DownloadAll } from "./download-all";

/**
 * F5 — Tab 1: "Six drafts, same evidence".
 *
 * The ATS badge on each card is computed (N5). A creative template reads Low
 * here and that is correct — the badge is how we ship them honestly.
 */
export default async function ResumesTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/");

  const drafts = await getDrafts(userId, id);

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
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2>Six drafts, same evidence</h2>
          {summary ? <p className="mt-1 text-[var(--color-text-muted)]">{summary}</p> : null}
        </div>
        <DownloadAll analysisId={id} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {drafts.map((draft) => {
          const template = templateById(draft.templateId);
          if (!template) return null;
          return (
            <Link key={draft.id} href={`/analysis/${id}/preview/${draft.templateId}`}>
              <Card className="flex h-full flex-col gap-3 p-3.5 transition-transform hover:-translate-y-[3px] hover:shadow-[var(--shadow-md)]">
                <TemplateThumb template={template} />
                <div>
                  <h3 className="mb-1 text-lg">{template.name}</h3>
                  <p className="text-sm text-[var(--color-text-muted)]">{template.blurb}</p>
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Tag tone="muted">{draft.pageCount} page{draft.pageCount === 1 ? "" : "s"}</Tag>
                  <Tag>{template.kind}</Tag>
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

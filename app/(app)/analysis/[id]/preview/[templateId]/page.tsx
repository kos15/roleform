import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { getAnalysis, getDrafts, getTailoredBullets } from "@/lib/db/queries/analysis";
import { buildRenderModel } from "@/lib/render/model";
import { templateById } from "@/lib/render/templates";
import { AtsBadge, Card, EmptyState, Tag } from "@/components/ui";
import { atsViolations } from "@/lib/render/ats-rules";
import type { StoredResume } from "@/lib/ai/schemas/resume-json";
import { PreviewSurface } from "./preview-surface";
import { DownloadButtons } from "./download-buttons";
import { TemplateSwitcher } from "./template-switcher";

/**
 * F6 — preview + diff.
 *
 * Changes are highlighted by default (M4.6), and the right rail admits what the
 * draft can't cover, then hands the user the fix. That cross-link is the
 * product's best moment — do not remove it.
 */
export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string; templateId: string }>;
}) {
  const { id, templateId } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/");

  const [analysis, drafts] = await Promise.all([
    getAnalysis(userId, id),
    getDrafts(userId, id),
  ]);
  if (!analysis) redirect("/history");
  // Same guard as the three tabs: nothing to preview until the run is finished.
  if (analysis.status !== "ready") redirect(`/analysis/${id}`);

  const draft = drafts.find((d) => d.templateId === templateId);
  const template = templateById(templateId);
  if (!draft || !template) {
    return (
      <EmptyState title="That draft doesn't exist for this analysis.">
        <Link href={`/analysis/${id}/resumes`} className="text-accent-body">
          Back to the drafts that do
        </Link>
        .
      </EmptyState>
    );
  }

  const tailored = await getTailoredBullets(userId, draft.id);
  const resume = draft.resumeJson as unknown as StoredResume & { x_orderedSkills?: string[] };

  const model = buildRenderModel({
    resume,
    tailored: tailored.map((t) => ({
      sourceBulletId: t.sourceBulletId,
      rewrittenText: t.rewrittenText,
      transform: t.transform,
    })),
    orderedSkills: resume.x_orderedSkills ?? [],
    summary: resume.basics.summary,
  });

  const violations = atsViolations(template.structuralFlags);

  return (
    <div className="flex flex-wrap items-start gap-[clamp(1.5rem,3vw,2.5rem)]">
      {/* The paper has its own intrinsic width; min-w-0 keeps it from setting
          the column floor and pushing the aside off the line. */}
      <div className="min-w-0 flex-[1_1_32rem]">
        <PreviewSurface
          model={model}
          template={template}
          pairs={tailored.map((t) => ({
            original: t.originalText,
            rewritten: t.rewrittenText,
            transform: t.transform,
          }))}
          actions={
            <div className="flex flex-wrap items-center gap-3">
              {/* The count is read off the drafts that exist, not written into
                  the copy: it is `capResumes` per member (F15), so any fixed
                  number here is wrong for somebody. */}
              <Link href={`/analysis/${id}/resumes`} className="btn btn-ghost btn-sm no-underline">
                <ArrowLeft className="lucide h-4 w-4" /> All {drafts.length} drafts
              </Link>
              <DownloadButtons draftId={draft.id} />
            </div>
          }
        />
      </div>

      <aside className="flex min-w-0 flex-[0_1_21rem] flex-col gap-5">
        <div>
          <h2 className="mb-2.5 text-[40px] leading-none">{template.name}</h2>
          <p className="mb-3.5 text-[15px] leading-normal text-[var(--color-text-muted)]">
            {template.blurb}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Tag tone="outline" className="border-[var(--color-line-strong)] capitalize">
              {template.kind}
            </Tag>
            <AtsBadge rating={draft.atsRating} />
            <Tag tone="muted">
              {draft.pageCount} page{draft.pageCount === 1 ? "" : "s"}
            </Tag>
          </div>

          {/* The rating's own reasons, read off the structural flags the rating
              was computed from (N5) — never a hand-written justification, which
              would be free to drift away from the badge beside it. */}
          <div className="mt-3.5 text-[13px] leading-normal text-[var(--color-text-muted)]">
            {/* The sentence version, in the template's own terms. It cannot
                contradict the list below it: `assertTemplates()` checks the
                violation count it claims against the flags, and the seed script
                refuses to write a template where the two disagree. */}
            <p className="mb-2">{template.atsWhy}</p>
            {violations.length === 0 ? (
              <p>All five structural rules met, so it rates High.</p>
            ) : (
              <>
                <p className="mb-1">
                  {violations.length === 1 ? "One violation" : `${violations.length} violations`},
                  so it rates {draft.atsRating}:
                </p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {violations.map((v) => (
                    <li key={v}>{v} — not met</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        <div>
          <p className="eyebrow mb-2.5">Switch template</p>
          <TemplateSwitcher
          analysisId={id}
          current={templateId}
          available={drafts.map((d) => d.templateId)}
          />
        </div>

        <Card className="rounded-[22px] px-[22px] py-5">
          <h3 className="mb-2.5 text-[17px]">What changed for this posting</h3>
          <ul className="list-disc space-y-1.5 pl-[18px] text-sm leading-normal text-[var(--color-text-muted)]">
            {draft.changes.map((change, i) => (
              <li key={i}>{change}</li>
            ))}
          </ul>
        </Card>

        {draft.missing.length > 0 ? (
          <div className="rounded-[22px] bg-[var(--color-sage-200)] px-[22px] py-5">
            <h3 className="mb-2 text-[17px]">Still not evidenced</h3>
            <p className="mb-3 text-sm leading-normal">
              This posting asks for these, and nothing in your profile evidences them. We
              didn&rsquo;t add them.
            </p>
            <div className="mb-3.5 flex flex-wrap gap-1.5">
              {draft.missing.map((m) => (
                // `missing` is skillName ?? the requirement's own text, so an
                // entry is either a short skill or a whole sentence. Only the
                // latter needs to wrap; forcing every pill full-width would
                // lose the scannable row.
                <Tag key={m} tone="sage" className={m.length > 28 ? "tag-long" : undefined}>
                  {m}
                </Tag>
              ))}
            </div>
            <Link
              href={`/analysis/${id}/learning?skills=${encodeURIComponent(draft.missing.join(","))}`}
              className="inline-flex items-center gap-1.5 text-sm font-extrabold underline underline-offset-[3px]"
            >
              <GraduationCap className="lucide h-4 w-4" /> See courses for these
            </Link>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

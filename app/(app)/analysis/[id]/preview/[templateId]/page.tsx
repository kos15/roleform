import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { GraduationCap } from "lucide-react";
import { getAnalysis, getDrafts, getTailoredBullets } from "@/lib/db/queries/analysis";
import { buildRenderModel } from "@/lib/render/model";
import { templateById } from "@/lib/render/templates";
import { AtsBadge, Card, EmptyState, Tag } from "@/components/ui";
import { atsViolations } from "@/lib/render/ats-rules";
import type { StoredResume } from "@/lib/ai/schemas/resume-json";
import { DiffView } from "./diff-view";
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

  const draft = drafts.find((d) => d.templateId === templateId);
  const template = templateById(templateId);
  if (!draft || !template) {
    return <EmptyState title="That draft doesn't exist for this analysis." />;
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
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Link href={`/analysis/${id}/resumes`} className="text-sm font-semibold text-accent-body">
            ← All templates
          </Link>
          <TemplateSwitcher
            analysisId={id}
            current={templateId}
            available={drafts.map((d) => d.templateId)}
          />
        </div>

        <DiffView
          model={model}
          pairs={tailored.map((t) => ({
            original: t.originalText,
            rewritten: t.rewrittenText,
            transform: t.transform,
          }))}
        />
      </div>

      <aside className="min-w-0 space-y-5">
        <Card>
          <h3 className="mb-1">{template.name}</h3>
          <p className="mb-3 text-sm text-[var(--color-text-muted)]">{template.blurb}</p>
          <div className="mb-4 flex flex-wrap gap-2">
            <Tag>{template.kind}</Tag>
            <AtsBadge rating={draft.atsRating} />
          </div>

          {violations.length > 0 ? (
            <div className="mb-4 text-sm text-[var(--color-text-muted)]">
              <p className="mb-1 font-semibold text-[var(--color-text)]">Why it rates that way</p>
              <ul className="list-disc space-y-1 pl-4">
                {violations.map((v) => (
                  <li key={v}>{v} — not met</li>
                ))}
              </ul>
            </div>
          ) : null}

          <DownloadButtons draftId={draft.id} />
        </Card>

        <Card>
          <h3 className="mb-2">What changed for this posting</h3>
          <ul className="list-disc space-y-1 pl-4 text-sm text-[var(--color-text-muted)]">
            {draft.changes.map((change, i) => (
              <li key={i}>{change}</li>
            ))}
          </ul>
        </Card>

        {draft.missing.length > 0 ? (
          <Card>
            <h3 className="mb-2">Still not evidenced</h3>
            <p className="mb-3 text-sm text-[var(--color-text-muted)]">
              This posting asks for these, and nothing in your profile evidences them. We
              didn&rsquo;t add them.
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              {draft.missing.map((m) => (
                // `missing` is skillName ?? the requirement's own text, so an
                // entry is either a short skill or a whole sentence. Only the
                // latter needs to wrap; forcing every pill full-width would
                // lose the scannable row.
                <Tag key={m} tone="accent" className={m.length > 28 ? "tag-long" : undefined}>
                  {m}
                </Tag>
              ))}
            </div>
            <Link
              href={`/analysis/${id}/learning?skills=${encodeURIComponent(draft.missing.join(","))}`}
              className="inline-flex items-center gap-1 text-sm font-semibold text-accent-body"
            >
              <GraduationCap className="lucide h-4 w-4" /> See courses for these
            </Link>
          </Card>
        ) : null}
      </aside>
    </div>
  );
}

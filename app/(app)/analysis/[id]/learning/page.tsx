import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { getCatalog, getGaps } from "@/lib/db/queries/analysis";
import { matchCourses } from "@/lib/catalog/match";
import { levelPosition } from "@/lib/domain/levels";
import { Card, EmptyState, Tag } from "@/components/ui";

/**
 * F8 — Tab 3: Learning.
 *
 * Gaps are ordered by how often the posting mentions them — the honest proxy
 * for what the employer cares about, and it comes free from JD analysis.
 *
 * Courses come from the curated catalog by deterministic matching (N8). A gap
 * with no vetted course shows an honest empty state; we never invent a link.
 */
export default async function LearningTab({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ skills?: string }>;
}) {
  const { id } = await params;
  const { skills: skillFilter } = await searchParams;
  const { userId } = await auth();
  if (!userId) redirect("/");

  const [gaps, catalog, account] = await Promise.all([
    getGaps(userId, id),
    getCatalog(),
    // The per-gap course cap (F15). It bounds the LIST, never the gap itself:
    // a gap is shown whether or not it has a course beside it, at any cap
    // including zero. That is the promise the admin panel makes.
    db.user.findUnique({ where: { clerkUserId: userId }, select: { capCourses: true } }),
  ]);
  const capCourses = account?.capCourses ?? 2;

  if (gaps.length === 0) {
    return (
      <EmptyState title="Nothing here to close">
        Your profile evidences everything this posting asks for. We&rsquo;d rather show you an
        empty tab than pad it.
      </EmptyState>
    );
  }

  // Deep-link target from the preview's "See courses for these" (F6).
  const wanted = skillFilter ? new Set(skillFilter.split(",").map((s) => s.trim())) : null;
  const shown = wanted ? gaps.filter((g) => wanted.has(g.skillName)) : gaps;

  return (
    <section>
      <div className="mb-5">
        <h2>
          {shown.length} requirement{shown.length === 1 ? "" : "s"} your résumé can&rsquo;t yet
          evidence
        </h2>
        <p className="mt-1 text-[var(--color-text-muted)]">
          Ordered by how often the posting mentions them. Courses come from a vetted catalog —
          where we have nothing checked, we say so.
          {wanted ? " Filtered to the skills you came here for." : ""}
        </p>
      </div>

      <div className="space-y-4">
        {shown.map((gap) => {
          const courses = matchCourses(
            { skillName: gap.skillName, userLevel: gap.userLevel, requiredLevel: gap.requiredLevel },
            catalog,
            capCourses,
          );

          return (
            <Card key={gap.id}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-5">
                <div className="max-w-[56ch]">
                  <div className="mb-2 flex flex-wrap items-center gap-2.5">
                    <h3>{gap.skillName}</h3>
                    <Tag tone="accent">Mentioned {gap.mentionCount}×</Tag>
                    <Tag tone="muted">You: {gap.userLevel}</Tag>
                    <Tag tone="muted">Required: {gap.requiredLevel}</Tag>
                  </div>
                  <p className="text-[var(--color-text-muted)]">{gap.note}</p>
                </div>

                {/* The distance, drawn. The bar is what the profile evidences,
                    the tick is what the posting asks for — the gap between them
                    is the thing the courses below are for. */}
                <div className="w-full min-w-[11rem] max-w-[14rem] flex-1">
                  <div className="mb-1.5 flex justify-between text-xs text-[var(--color-text-muted)]">
                    <span>You</span>
                    <span>Required</span>
                  </div>
                  <div
                    className="meter"
                    role="img"
                    aria-label={`Your level: ${gap.userLevel}. This posting asks for: ${gap.requiredLevel}.`}
                  >
                    <span
                      className="meter-have"
                      style={{ width: `${levelPosition(gap.userLevel)}%` }}
                    />
                    <span
                      className="meter-need"
                      style={{ left: `${levelPosition(gap.requiredLevel)}%` }}
                    />
                  </div>
                </div>
              </div>

              {courses.length === 0 ? (
                <p className="text-sm text-accent-body">
                  We don&rsquo;t have a vetted course for this yet. We&rsquo;d rather say so than
                  send you to a link we haven&rsquo;t checked.
                </p>
              ) : (
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(248px,100%),1fr))]">
                  {courses.map((course) => (
                    <a
                      key={course.id}
                      href={course.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg-sunken)] p-4"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--color-accent-200)] text-xs font-bold text-[var(--color-accent-800)]">
                          {course.mark}
                        </span>
                        <span className="text-sm font-semibold">{course.provider}</span>
                      </div>
                      <p className="mb-2 font-semibold">{course.title}</p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Tag tone={course.isFree ? "sage" : "muted"}>{course.priceLabel}</Tag>
                        <Tag tone="muted">{course.lengthLabel}</Tag>
                        <Tag tone="muted">{course.level}</Tag>
                      </div>
                      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent-body">
                        View course <ExternalLink className="lucide h-3.5 w-3.5" />
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

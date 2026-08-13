import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ArrowRight, ExternalLink, MessageCircleQuestion, PenLine, Play } from "lucide-react";
import { getLearningPlan } from "@/lib/db/queries/learning";
import { formatMinutes } from "@/lib/domain/plan";
import { levelPosition } from "@/lib/domain/levels";
import { Card, EmptyState, Tag } from "@/components/ui";
import { BudgetPicker } from "./budget-picker";

/**
 * Tab 3 — Learning. The Roleform Learning Engine's only user-facing surface.
 *
 * ── What this page is trying to be ──────────────────────────────────────────
 * Not a list of courses. RLE spec §1: the real goal is to let the candidate
 * walk into THIS interview able to truthfully claim something they could not
 * claim yesterday. So a resource is shown together with what it is FOR — the
 * gap it closes, the résumé bullet it unlocks, and the interview question it
 * answers.
 *
 * The loop is drawn wherever it was genuinely earned, and simply absent where
 * it was not. Spec §1 would hide the material in that case; measured against a
 * real profile that hid good resources for 5 of 6 gaps, and the risk it was
 * guarding — a binding pointing at the wrong bullet — is prevented at the
 * source instead (lib/domain/binding.ts, plus the OUT-2 CHECK on skill_gaps).
 *
 * ── Where every number comes from ───────────────────────────────────────────
 * Severity, the meter positions, the ordering and the schedule are all pure
 * functions (lib/domain/severity.ts, lib/domain/plan.ts). The only prose a
 * model wrote is `opening`, `sequenceNote`, `whyItMatters` and the per-resource
 * notes — and each of those was checked against a stored span before it was
 * saved (guardrails.md OUT-2, OUT-4, OUT-6). Nothing on this page is a link a
 * model produced: every URL is read from the curated catalog (N8, OUT-1).
 */
export default async function LearningTab({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ skills?: string; budget?: string }>;
}) {
  const { id } = await params;
  const { skills: skillFilter, budget } = await searchParams;
  const { userId } = await auth();
  if (!userId) redirect("/");

  const budgetMin = parseBudget(budget);
  const plan = await getLearningPlan(userId, id, budgetMin);

  if (!plan) {
    return (
      <EmptyState title="Nothing here to close">
        Your profile evidences everything this posting asks for. We&rsquo;d rather show you an
        empty tab than pad it.
      </EmptyState>
    );
  }

  // Deep-link target from the preview's "See courses for these" (F6).
  const wanted = skillFilter ? new Set(skillFilter.split(",").map((s) => s.trim())) : null;
  const shown = wanted ? plan.gaps.filter((g) => wanted.has(g.skillName)) : plan.gaps;
  const scheduled = shown.flatMap((g) => g.steps.filter((s) => !s.deferred));

  return (
    <section>
      {/* ------------------------------------------------------------ header */}
      <div className="mb-6">
        <h2>
          {shown.length} thing{shown.length === 1 ? "" : "s"} to close before this interview
        </h2>
        <p className="mt-1 max-w-[64ch] text-[var(--color-text-muted)]">
          {plan.opening ||
            "Ordered by how much of this posting each one unlocks. Where we can tie one to a " +
              "bullet on your résumé or a question you're likely to be asked, we show that too."}
          {wanted ? " Filtered to the skills you came here for." : ""}
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <BudgetPicker selected={plan.budgetMin} />
        <p className="text-sm text-[var(--color-text-muted)]">
          {scheduled.length === 0
            ? "Nothing fits that budget — try a longer one."
            : `${scheduled.length} step${scheduled.length === 1 ? "" : "s"}, ${formatMinutes(plan.totalMin)} of study.`}
          {plan.sequenceNote ? ` ${plan.sequenceNote}` : ""}
        </p>
      </div>

      {/* ------------------------------------------------------------- gaps */}
      <div className="space-y-4">
        {shown.map((gap) => (
          <Card key={gap.id}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-5">
              <div className="max-w-[58ch]">
                <div className="mb-2 flex flex-wrap items-center gap-2.5">
                  <h3>{gap.skillName}</h3>
                  {/* The number the ranking is actually made of. Named honestly:
                      it is how much of THIS posting the skill accounts for, not
                      a score about the person.

                      Analyses that ran before the engine existed carry severity
                      0, because nothing computed one. Printing "0 / 100" for
                      those would read as a score of zero rather than as an
                      absent score — so they keep the mention count the old tab
                      ranked by, which is what they were actually ordered on. */}
                  {gap.severity > 0 ? (
                    <Tag tone="accent">{Math.round(gap.severity)} / 100 of this posting</Tag>
                  ) : null}
                  <Tag tone="muted">Mentioned {gap.mentionCount}×</Tag>
                </div>

                {gap.whyItMatters ? (
                  <p className="mb-2">{gap.whyItMatters}</p>
                ) : null}
                <p className="text-[var(--color-text-muted)]">{gap.note}</p>

                {gap.jdQuote ? (
                  <blockquote className="mt-3 border-l-2 border-[var(--color-accent-300)] pl-3 text-sm italic text-[var(--color-text-muted)]">
                    &ldquo;{gap.jdQuote}&rdquo;
                  </blockquote>
                ) : null}
              </div>

              {/* The distance, drawn. The bar is what the profile evidences,
                  the tick is what the posting asks for. Both come from the same
                  deterministic evidence value as the prose above (OUT-5). */}
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
                  <span className="meter-have" style={{ width: `${levelPosition(gap.userLevel)}%` }} />
                  <span className="meter-need" style={{ left: `${levelPosition(gap.requiredLevel)}%` }} />
                </div>
              </div>
            </div>

            {/* -------------------------------------------------- resources */}
            {gap.steps.length === 0 ? (
              <FallbackNote fallback={gap.fallback} />
            ) : (
              <ol className="space-y-3">
                {[...gap.steps]
                  .sort((a, b) => Number(a.deferred) - Number(b.deferred) || a.order - b.order)
                  .map((step) => (
                    <li key={step.id}>
                      <a
                        href={step.entryUrl ?? step.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`block rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg-sunken)] p-4 ${
                          step.deferred ? "opacity-60" : ""
                        }`}
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--color-accent-200)] text-xs font-bold text-[var(--color-accent-800)]">
                            {step.mark}
                          </span>
                          <span className="text-sm font-semibold">
                            {step.author ?? step.provider}
                          </span>
                          {step.deferred ? (
                            <Tag tone="muted">Outside your budget</Tag>
                          ) : (
                            <Tag tone="muted">
                              from {formatMinutes(step.startsAtMin)} in
                            </Tag>
                          )}
                        </div>

                        <p className="mb-1 font-semibold">{step.title}</p>

                        {/* Spec §8 — the differentiator is WHERE you land.
                            "Watch minutes 14:20–26:05" beats "watch this
                            eight-hour course", and the timestamp was computed
                            once at bundle-build time, never here. */}
                        {step.entryLabel ? (
                          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-accent-body">
                            <Play className="lucide h-3.5 w-3.5" />
                            Start at {step.entryLabel}
                          </p>
                        ) : null}

                        {step.note ? (
                          <p className="mb-2 text-sm text-[var(--color-text-muted)]">{step.note}</p>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Tag tone={step.isFree ? "sage" : "muted"}>{step.priceLabel}</Tag>
                          <Tag tone="muted">{formatMinutes(step.durationMin)}</Tag>
                          <span className="inline-flex items-center gap-1 font-semibold text-accent-body">
                            Open <ExternalLink className="lucide h-3.5 w-3.5" />
                          </span>
                        </div>
                      </a>
                    </li>
                  ))}
              </ol>
            )}

            {/* ------------------------------------ the proof-of-learning loop */}
            {gap.unlocksBullet || gap.answersQuestion ? (
              <div className="mt-4 space-y-3 rounded-[var(--radius-md)] bg-[var(--color-accent-100)] p-4">
                {gap.unlocksBullet ? (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-[var(--color-accent-800)]">
                      <PenLine className="lucide h-4 w-4" />
                      What it unlocks on your résumé
                    </p>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      Today: &ldquo;{gap.unlocksBullet.text}&rdquo;
                    </p>
                    <p className="mt-1 flex items-start gap-1.5 text-sm">
                      <ArrowRight className="lucide mt-0.5 h-4 w-4 shrink-0" />
                      <span>{gap.unlocksBullet.draft}</span>
                    </p>
                  </div>
                ) : null}

                {gap.answersQuestion ? (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-[var(--color-accent-800)]">
                      <MessageCircleQuestion className="lucide h-4 w-4" />
                      The question it answers
                    </p>
                    <Link
                      href={`/analysis/${id}/prep#q-${gap.answersQuestion.id}`}
                      className="text-sm text-accent-body underline underline-offset-2"
                    >
                      &ldquo;{gap.answersQuestion.text}&rdquo;
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>
        ))}
      </div>

      {plan.fallbackCount > 0 ? (
        <p className="mt-6 max-w-[62ch] text-sm text-[var(--color-text-muted)]">
          {plan.fallbackCount} of these has no vetted material in our catalog yet, so it points at
          a roadmap instead. We log every one of those — it&rsquo;s how we decide what to add next.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Spec §9. No live web search, no YouTube lookup, no guessed link — the
 * roadmap node or nothing. An unvetted link is the one failure that costs this
 * tab its credibility permanently (N8).
 */
function FallbackNote({ fallback }: { fallback: { url: string; label: string } | null }) {
  if (!fallback) {
    return (
      <p className="text-sm text-accent-body">
        We don&rsquo;t have vetted material for this yet. We&rsquo;d rather say so than send you to
        a link we haven&rsquo;t checked.
      </p>
    );
  }
  return (
    <a
      href={fallback.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-body"
    >
      {fallback.label} <ExternalLink className="lucide h-3.5 w-3.5" />
    </a>
  );
}

/** Minutes, clamped to something a knapsack can actually solve. */
function parseBudget(raw: string | undefined): number | null {
  if (!raw) return null;
  const minutes = Number.parseInt(raw, 10);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.min(minutes, 60 * 100);
}

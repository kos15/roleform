import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ArrowRight, ExternalLink, MessageCircleQuestion, PenLine, Play } from "lucide-react";
import { getAnalysis } from "@/lib/db/queries/analysis";
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
  // Same guard as the other two tabs: until the run is `ready` the layout draws
  // no header and no tab bar, so this page would be an orphan.
  const [analysis, plan] = await Promise.all([
    getAnalysis(userId, id),
    getLearningPlan(userId, id, budgetMin),
  ]);
  if (!analysis) redirect("/history");
  if (analysis.status !== "ready") redirect(`/analysis/${id}`);

  if (!plan) {
    return (
      <EmptyState title="Nothing here to close">
        Your profile evidences everything this posting asks for. We&rsquo;d rather show you an
        empty tab than pad it.
      </EmptyState>
    );
  }

  // Deep-link target from the preview's "See courses for these" (F6).
  //
  // The preview sends `skillName ?? the requirement's own text`, so half of what
  // arrives here is a whole sentence that will never match a gap's skill name.
  // Matching is case-insensitive for the half that can match, and a filter that
  // matches nothing falls back to the whole plan with a line saying so —
  // filtering a page down to zero and leaving no way back was a dead end that
  // looked like an empty product.
  const wanted = skillFilter
    ? new Set(
        skillFilter
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      )
    : null;
  const matched = wanted ? plan.gaps.filter((g) => wanted.has(g.skillName.toLowerCase())) : null;
  const filtered = matched !== null && matched.length > 0;
  const shown = filtered ? matched! : plan.gaps;
  const scheduled = shown.flatMap((g) => g.steps.filter((s) => !s.deferred));

  return (
    <section>
      {/* ------------------------------------------------------------ header */}
      <div className="mb-[22px] max-w-[780px]">
        <h2 className="mb-2.5">
          {shown.length} thing{shown.length === 1 ? "" : "s"} to close before this interview
        </h2>
        <p className="max-w-[64ch] text-base leading-relaxed text-[var(--color-text-muted)]">
          {plan.opening ||
            "Ordered by how much of this posting each one unlocks. Where we can tie one to a " +
              "bullet on your résumé or a question you're likely to be asked, we show that too."}
          {filtered ? " Filtered to the skills you came here for." : ""}
          {wanted && !filtered
            ? " Nothing in the plan matched the skills you came from, so this is all of it."
            : ""}
        </p>
        {filtered ? (
          <Link
            // Keeps the budget: clearing the skills filter shouldn't also throw
            // away how much time the reader said they have.
            href={`/analysis/${id}/learning${budgetMin ? `?budget=${budgetMin}` : ""}`}
            className="mt-2 inline-block text-sm font-bold"
          >
            Show every gap
          </Link>
        ) : null}
      </div>

      <div className="mb-7 flex flex-wrap items-center gap-x-[22px] gap-y-3.5">
        <BudgetPicker selected={plan.budgetMin} />
        <p className="text-[15px] text-[var(--color-text-muted)]">
          {scheduled.length === 0
            ? "Nothing fits that budget — try a longer one."
            : `${scheduled.length} step${scheduled.length === 1 ? "" : "s"}, ${formatMinutes(plan.totalMin)} of study.`}
          {plan.sequenceNote ? ` ${plan.sequenceNote}` : ""}
        </p>
      </div>

      {/* ------------------------------------------------------------- gaps */}
      <div className="space-y-5">
        {shown.map((gap) => (
          <Card key={gap.id} className="rounded-[26px] p-[clamp(1.25rem,2.6vw,2rem)]">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-[22px]">
              <div className="max-w-[60ch]">
                <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
                  <h3 className="display mr-1.5 text-[clamp(1.75rem,3vw,2.4rem)] font-normal">
                    {gap.skillName}
                  </h3>
                  {/* The number the ranking is actually made of. Named honestly:
                      it is how much of THIS posting the skill accounts for, not
                      a score about the person.

                      Analyses that ran before the engine existed carry severity
                      0, because nothing computed one. Printing "0 / 100" for
                      those would read as a score of zero rather than as an
                      absent score — so they keep the mention count the old tab
                      ranked by, which is what they were actually ordered on. */}
                  {gap.severity > 0 ? (
                    <Tag tone="accent" className="font-extrabold">
                      {Math.round(gap.severity)} / 100 of this posting
                    </Tag>
                  ) : null}
                  <Tag tone="muted">Mentioned {gap.mentionCount}×</Tag>
                </div>

                {gap.whyItMatters ? (
                  <p className="mb-1.5 text-base leading-relaxed">{gap.whyItMatters}</p>
                ) : null}
                <p className="text-[15px] leading-relaxed text-[var(--color-text-muted)]">{gap.note}</p>

                {gap.jdQuote ? (
                  <blockquote className="mt-3 flex gap-2 text-sm italic text-[var(--color-text-muted)]">
                    <span
                      aria-hidden
                      className="display text-2xl not-italic leading-[0.9] text-[var(--color-accent-600)]"
                    >
                      &ldquo;
                    </span>
                    {gap.jdQuote}
                  </blockquote>
                ) : null}
              </div>

              {/* The distance, drawn. The bar is what the profile evidences,
                  the tick is what the posting asks for. Both come from the same
                  deterministic evidence value as the prose above (OUT-5). */}
              <div className="w-full min-w-[11rem] max-w-[15rem] flex-[1_1_11rem] self-center">
                <div className="mb-2 flex justify-between text-xs font-bold text-[var(--color-text-muted)]">
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
                        className={`block rounded-[var(--radius-md)] bg-[var(--color-bg-tint)] px-[18px] py-4 no-underline transition-transform hover:-translate-y-0.5 ${
                          step.deferred ? "opacity-50" : ""
                        }`}
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-pill)] bg-[var(--color-accent-500)] text-xs font-extrabold">
                            {step.mark}
                          </span>
                          <span className="text-sm font-extrabold">
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

                        <p className="mb-1.5 text-base font-extrabold">{step.title}</p>

                        {/* Spec §8 — the differentiator is WHERE you land.
                            "Watch minutes 14:20–26:05" beats "watch this
                            eight-hour course", and the timestamp was computed
                            once at bundle-build time, never here. */}
                        {step.entryLabel ? (
                          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-extrabold">
                            <Play className="lucide h-3.5 w-3.5 fill-current" />
                            Start at {step.entryLabel}
                          </p>
                        ) : null}

                        {step.note ? (
                          <p className="mb-2.5 text-sm leading-normal text-[var(--color-text-muted)]">{step.note}</p>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Tag
                            className={`font-extrabold ${step.isFree ? "bg-[var(--color-bg-raised)]" : ""}`}
                          >
                            {step.priceLabel}
                          </Tag>
                          <Tag tone="muted">{formatMinutes(step.durationMin)}</Tag>
                          <span className="ml-1 inline-flex items-center gap-1 text-[13px] font-extrabold">
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
              <div className="mt-3.5 grid gap-[18px] rounded-[var(--radius-md)] bg-[var(--color-sage-200)] px-5 py-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
                {gap.unlocksBullet ? (
                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-sm font-extrabold">
                      <PenLine className="lucide h-4 w-4" />
                      What it unlocks on your résumé
                    </p>
                    <p className="text-sm leading-normal">
                      Today: &ldquo;{gap.unlocksBullet.text}&rdquo;
                    </p>
                    <p className="mt-1.5 flex items-start gap-1.5 text-sm font-semibold leading-normal">
                      <ArrowRight className="lucide mt-0.5 h-4 w-4 shrink-0" />
                      <span>{gap.unlocksBullet.draft}</span>
                    </p>
                  </div>
                ) : null}

                {gap.answersQuestion ? (
                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-sm font-extrabold">
                      <MessageCircleQuestion className="lucide h-4 w-4" />
                      The question it answers
                    </p>
                    <Link
                      href={`/analysis/${id}/prep#q-${gap.answersQuestion.id}`}
                      className="text-sm leading-normal underline underline-offset-[3px]"
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
        <p className="mt-6 max-w-[62ch] text-sm leading-relaxed text-[var(--color-text-muted)]">
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
      className="inline-flex items-center gap-1.5 text-sm font-extrabold"
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

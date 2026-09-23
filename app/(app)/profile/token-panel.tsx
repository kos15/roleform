import Link from "next/link";
import { db } from "@/lib/db";
import { accountTokens } from "@/lib/db/queries/tokens";
import { cycleStart } from "@/lib/domain/quotas";
import {
  DRAFT_ESTIMATE,
  RUN_ESTIMATE,
  TOKEN_STAGES,
  formatCount,
  formatResetDate,
  formatResetIn,
} from "@/lib/domain/tokens";
import { planById } from "@/lib/content/pricing";
import { isUncapped } from "@/lib/domain/entitlements";
import { settlePlan } from "@/lib/db/queries/plan";
import { Tag } from "@/components/ui";

/**
 * Where the tokens went (F19).
 *
 * The header pill is a number; this is the paragraph behind it, and the reason
 * the pill is a link rather than a tooltip. Everything here is measured — the
 * per-analysis figures are SUMs over that run's `ai_runs` rows, not the
 * estimates we quote before a run.
 *
 * The estimates and the actuals are shown side by side deliberately. A member
 * who was told "about 20,000" and drew 24,800 should be able to see both
 * numbers on one screen rather than wondering which one we meant.
 */
export async function TokenPanel({ clerkUserId }: { clerkUserId: string }) {
  // Settled first (F23, PAY-2): a lapsed member reads Free here, not a plan
  // they stopped paying for. `accountTokens` below reads the same row, so the
  // balance and the plan name are guaranteed to agree with each other.
  await settlePlan(clerkUserId);

  const account = await accountTokens(clerkUserId);
  if (!account) return null;

  const { balance } = account;
  const user = await db.user.findUnique({
    where: { clerkUserId },
    select: { plan: true, quotaResetsAt: true, role: true, planExpiresAt: true },
  });
  const plan = planById(user?.plan ?? "free");

  // An uncapped account has a usage number and no ceiling, so every reading
  // built from `total` — "left of", the bar, "runs left at today's rate" — is
  // measuring against a limit that will not be enforced. Showing the drawn
  // figure alone is the honest version, and it is still the number that
  // matters: uncapped is not unmeasured (lib/domain/entitlements.ts).
  const uncapped = isUncapped(user?.role ?? "member");

  // What each analysis in this cycle actually cost. Grouped in the database:
  // one row per analysis rather than one query per analysis.
  const drawn = await db.aiRun.groupBy({
    by: ["analysisId"],
    where: {
      clerkUserId,
      analysisId: { not: null },
      createdAt: { gte: cycleStart(user?.quotaResetsAt ?? null) },
    },
    _sum: { inputTokens: true, outputTokens: true },
  });

  const analyses = drawn.length
    ? await db.analysis.findMany({
        where: { clerkUserId, id: { in: drawn.map((d) => d.analysisId!) } },
        select: { id: true, company: true, title: true, createdAt: true },
      })
    : [];

  const ledger = drawn
    .map((d) => {
      const analysis = analyses.find((a) => a.id === d.analysisId);
      return {
        id: d.analysisId!,
        label:
          [analysis?.company, analysis?.title].filter(Boolean).join(" · ") || "An analysis",
        when: analysis?.createdAt ?? new Date(0),
        cost: (d._sum.inputTokens ?? 0) + (d._sum.outputTokens ?? 0),
      };
    })
    .sort((a, b) => b.when.getTime() - a.when.getTime())
    .slice(0, 8);

  return (
    // No width or top margin of its own: it is the first card in the editor's
    // left column now, and it takes that column's measure.
    <section className="rounded-[26px] bg-[var(--color-accent-500)] p-[clamp(1.25rem,2.6vw,1.9rem)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow mb-2 text-[var(--color-text)]">Token allowance</p>
          <h3 className="display mb-2 text-[clamp(2.1rem,3.8vw,3.1rem)] font-normal">
            {uncapped
              ? `${formatCount(balance.used)} drawn this cycle`
              : `${formatCount(balance.left)} left of ${formatCount(balance.total)}`}
          </h3>
          <p className="text-[14.5px] leading-normal">
            {uncapped ? (
              <>
                Admin · no allowance ceiling · still measured on every run, and counted in the
                workspace totals
              </>
            ) : (
              <>
                {plan.name}
                {user?.planExpiresAt ? (
                  <>
                    {" "}
                    until{" "}
                    {user.planExpiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </>
                ) : null}{" "}
                · resets {formatResetDate(account.resetsAt)}, {formatResetIn(account.resetsAt)} ·
                about {balance.runsLeft} {balance.runsLeft === 1 ? "run" : "runs"} at
                today&rsquo;s rate
              </>
            )}
          </p>
        </div>
        {uncapped ? (
          <Tag tone="outline" className="min-h-8 px-3.5 font-extrabold">Unlimited</Tag>
        ) : balance.low ? (
          <Tag tone="sage" className="min-h-8 px-3.5 font-extrabold">
            {balance.empty ? "Not enough for a run" : "Running low"}
          </Tag>
        ) : (
          <Tag tone="outline" className="min-h-8 px-3.5 font-extrabold">Healthy</Tag>
        )}
      </div>

      {/* No bar without a ceiling — a progress bar against a limit nothing
          enforces is a picture of a number that means nothing. */}
      {uncapped ? null : (
        <>
          <div
            className="mb-2 flex h-3 overflow-hidden rounded-[var(--radius-pill)]"
            style={{ background: "rgb(74 13 13 / 0.14)" }}
          >
            <span
              style={{
                width: `${((balance.used / (balance.total || 1)) * 100).toFixed(1)}%`,
                background: balance.low ? "var(--color-sage-600)" : "var(--color-text)",
              }}
            />
          </div>
          <p className="mb-[22px] text-[12.5px]">
            {formatCount(balance.used)} drawn this cycle
            {balance.topups > 0
              ? ` · ${formatCount(balance.topups)} of that allowance is unspent top-up, which carries over`
              : ""}
          </p>
        </>
      )}
      {uncapped ? <div className="mb-6" /> : null}

      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(15rem,100%),1fr))]">
        <div className="rounded-[18px] bg-[var(--color-bg-raised)] px-[18px] py-4">
          <p className="eyebrow mb-2.5">What things cost</p>
          <ul className="flex list-none flex-col gap-1.5 p-0 text-sm">
            {TOKEN_STAGES.map((s) => (
              <li key={s.stage} className="flex justify-between gap-3">
                <span className="min-w-0 flex-1 text-[var(--color-text-muted)]">{s.stage}</span>
                <span className="tabular-nums">{formatCount(s.estimate)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 border-t border-[var(--color-line)] pt-2 font-extrabold">
              <span>A full analysis</span>
              <span className="tabular-nums">{formatCount(RUN_ESTIMATE)}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-[var(--color-text-muted)]">One drafted answer</span>
              <span className="tabular-nums">{formatCount(DRAFT_ESTIMATE)}</span>
            </li>
          </ul>
          <p className="mt-2.5 text-xs leading-relaxed text-[var(--color-text-muted)]">
            Estimates, used to decide whether a run can be afforded before it starts. Coverage,
            gaps and question frameworks cost nothing.
          </p>
        </div>

        <div className="rounded-[18px] bg-[var(--color-bg-raised)] px-[18px] py-4">
          <p className="eyebrow mb-2.5">What you actually drew</p>
          {ledger.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              Nothing this cycle yet. The first analysis will appear here with its real cost.
            </p>
          ) : (
            <ul className="flex list-none flex-col gap-2 p-0 text-sm">
              {ledger.map((row) => (
                <li key={row.id} className="flex justify-between gap-3">
                  <Link href={`/analysis/${row.id}/resumes`} className="min-w-0 flex-1 truncate">
                    {row.label}
                  </Link>
                  <span className="tabular-nums text-[var(--color-text-muted)]">
                    {formatCount(row.cost)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2.5 text-xs leading-relaxed text-[var(--color-text-muted)]">
            Measured from every model call the run made, including the ones that were retried. A
            stage that failed on our side is here at what it burned, and no more.
          </p>
        </div>
      </div>

      <div className="mt-[18px] flex flex-wrap gap-2">
        <Link href="/pricing" className="btn btn-primary btn-sm no-underline">
          Compare plans
        </Link>
      </div>
    </section>
  );
}

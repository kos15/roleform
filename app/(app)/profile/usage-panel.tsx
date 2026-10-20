import Link from "next/link";
import { db } from "@/lib/db";
import { cycleCounts, type CountLine } from "@/lib/db/queries/usage";
import { formatResetDate, formatResetIn } from "@/lib/domain/tokens";
import { loadPlan } from "@/lib/plans/catalog";
import { settlePlan } from "@/lib/db/queries/plan";
import { Tag } from "@/components/ui";

/**
 * This cycle's usage, in the counts the pricing page prints (counts-only
 * pricing, Oct 2026). Replaced the token panel: members see what they have
 * done and what is left, never a unit of model consumption. Admins still see
 * tokens in the admin panel.
 */
export async function UsagePanel({ clerkUserId }: { clerkUserId: string }) {
  // Settled first (F23, PAY-2): a lapsed member reads Free here.
  await settlePlan(clerkUserId);

  const counts = await cycleCounts(clerkUserId);
  if (!counts) return null;
  const user = await db.user.findUnique({ where: { clerkUserId }, select: { plan: true, planExpiresAt: true } });
  const plan = await loadPlan(user?.plan ?? "free");
  const uncapped = counts.analyses.cap === null;

  const rows: Array<{ label: string; line: CountLine; extra?: number }> = [
    { label: "Analyses", line: counts.analyses, extra: counts.analyses.bonusLeft },
    { label: "Full answer drafts", line: counts.answers },
    { label: "Practice sessions", line: counts.practice },
    { label: "Roadmaps", line: counts.roadmaps },
    { label: "Job searches", line: counts.jobSearches },
  ];

  return (
    <section data-help="usage-panel" className="rounded-[26px] bg-[var(--color-accent-500)] p-[clamp(1.25rem,2.6vw,1.9rem)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow mb-2 text-[var(--color-text)]">This cycle</p>
          <h3 className="display mb-2 text-[clamp(2.1rem,3.8vw,3.1rem)] font-normal">
            {uncapped
              ? `${counts.analyses.used} analyses run`
              : `${(counts.analyses.left ?? 0) + counts.analyses.bonusLeft} analyses left`}
          </h3>
          <p className="text-[14.5px] leading-normal">
            {uncapped ? (
              "Admin · no limits"
            ) : (
              <>
                {plan.name}
                {user?.planExpiresAt
                  ? ` until ${user.planExpiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                  : ""}{" "}
                · resets {formatResetDate(counts.resetsAt)}, {formatResetIn(counts.resetsAt)}
              </>
            )}
          </p>
        </div>
        {uncapped ? <Tag tone="outline" className="min-h-8 px-3.5 font-extrabold">Unlimited</Tag> : null}
      </div>

      <ul className="flex list-none flex-col gap-2.5 rounded-[18px] bg-[var(--color-bg-raised)] p-[18px] text-sm">
        {rows.map(({ label, line, extra }) => (
          <li key={label} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 flex-1">{label}</span>
            <span className="tabular-nums font-extrabold">
              {line.cap === null ? line.used : line.cap === 0 ? "Off" : `${line.used} of ${line.cap}`}
              {extra ? <span className="ml-1.5 text-xs font-medium text-[var(--color-text-muted)]">+{extra} extra</span> : null}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-[18px] flex flex-wrap gap-2">
        <Link href="/pricing" className="btn btn-primary btn-sm no-underline">
          Compare plans
        </Link>
      </div>
    </section>
  );
}

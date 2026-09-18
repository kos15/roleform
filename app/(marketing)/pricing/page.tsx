import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { PageIntro, Bullet } from "@/components/page-intro";
import { Tag } from "@/components/ui";
import { displayCap } from "@/lib/domain/quotas";
import { COMPARE_ROWS, PLANS, PLAN_ROWS, PRICING_REFUSALS, TOPUPS } from "@/lib/content/pricing";
import { RUN_ESTIMATE, TOKEN_STAGES, formatCount } from "@/lib/domain/tokens";
import { CheckoutButton } from "@/components/checkout-button";
import { db } from "@/lib/db";
import { settlePlan } from "@/lib/db/queries/plan";

export const metadata: Metadata = {
  title: "Pricing · Roleform",
  description:
    "Three plans, metered in tokens rather than in features. Nothing behind the paywall changes what the product will say about you.",
};

/**
 * F17 — pricing.
 *
 * Every number on this page is a cap the code enforces (lib/content/pricing.ts),
 * so the table cannot drift from what actually happens when you reach one. The
 * refusals at the bottom are there for the same reason the four pipeline stages
 * publish theirs: this is the page a product is most tempted to overclaim on.
 */
export default async function PricingPage() {
  // Public route (middleware.ts) — signed-out visitors read `null` here and
  // every card shows its ordinary CTA. Settled first (F23, PAY-2) so a
  // lapsed member sees "Go Pro" again rather than a stale "Renew" on a plan
  // that no longer applies to them.
  const { userId } = await auth();
  if (userId) await settlePlan(userId);
  const currentPlanId = userId
    ? (await db.user.findUnique({ where: { clerkUserId: userId }, select: { plan: true } }))?.plan
    : null;

  return (
    <div className="mx-auto w-full max-w-[1000px] px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1.75rem,5vw,3.5rem)] pb-16">
      <PageIntro kicker="Pricing" title="Pay for the runs, not for the seat">
        Every plan does the same four-stage analysis with the same fabrication boundary. What
        changes is how much of it you can do — metered in tokens, measured from what the models
        actually consumed, at about {formatCount(RUN_ESTIMATE)} for a full run.
      </PageIntro>

      <div className="mb-10 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className="flex flex-col gap-4 rounded-[var(--radius-lg)] border bg-[var(--color-bg-raised)] p-[clamp(1.25rem,3vw,1.625rem)]"
            style={{
              borderColor: plan.featured ? "var(--color-accent-300)" : "var(--color-line)",
            }}
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-[family-name:var(--font-heading)] text-[1.1875rem]">
                {plan.name}
              </span>
              {plan.featured ? <Tag tone="accent">Most people want this</Tag> : null}
            </div>

            <div className="flex items-baseline gap-[7px]">
              <span className="font-[family-name:var(--font-heading)] text-[2.25rem] leading-none">
                {plan.price}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">{plan.unit}</span>
            </div>

            <p className="flex-1 text-[0.85rem] leading-relaxed text-[var(--color-text-muted)]">
              {plan.tagline}
            </p>

            {/* The five numbers, in the plan's own card as well as in the table
                below — someone comparing three columns should not have to hold
                a row heading in their head to read one. */}
            <dl className="flex flex-col gap-2 border-t border-[var(--color-line)] pt-3.5">
              {PLAN_ROWS.map((row) => (
                <div key={row.key} className="flex items-baseline justify-between gap-3 text-[0.85rem]">
                  <dt className="text-[var(--color-text-muted)]">{row.label}</dt>
                  <dd className="font-semibold tabular-nums">
                    {displayCap(row.key, plan.caps[row.key])}
                    <span className="ml-1 text-xs font-normal text-[var(--color-text-muted)]">
                      {row.unit}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>

            {plan.pricePaise > 0 ? (
              <CheckoutButton
                purchase={{ kind: "plan", id: plan.id }}
                label={currentPlanId === plan.id ? `Renew ${plan.name}` : plan.cta}
                description={`Roleform — ${plan.name}, one month`}
                variant={plan.featured ? "primary" : "secondary"}
                className="w-full"
              />
            ) : (
              <Link href="/onboarding" className="btn btn-secondary w-full no-underline">
                {plan.cta}
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Side by side. Every row is a cap the code enforces — see COMPARE_ROWS
          for the three the design carries that this deliberately omits. The
          grid scrolls inside its own rounded box rather than widening the page;
          a comparison table is the one layout that cannot reflow. */}
      <section className="mb-9">
        <h3 className="mb-1.5">Side by side</h3>
        <p className="mb-4 max-w-[56ch] text-[0.85rem] leading-relaxed text-[var(--color-text-muted)]">
          Every row is a number enforced at its own seam. Nothing here is a feature list — if it is
          on this table, there is a constraint behind it.
        </p>
        <div className="table-scroll rounded-[var(--radius-lg)] border border-[var(--color-line)]">
          <div className="grid min-w-[36rem] [grid-template-columns:minmax(11rem,1.6fr)_repeat(3,minmax(6rem,1fr))]">
            <div className="card-kicker bg-[var(--color-bg-raised)] px-[1.125rem] py-3.5 text-[var(--color-text-muted)]">
              What you get
            </div>
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className="px-3 py-3.5 text-center font-[family-name:var(--font-heading)] text-base"
                style={
                  plan.featured
                    ? { background: "var(--color-accent-100)", color: "var(--color-accent-800)" }
                    : { background: "var(--color-bg-raised)" }
                }
              >
                {plan.name}
              </div>
            ))}

            {COMPARE_ROWS.map((row) => (
              <Fragment key={row.label}>
                <div className="flex flex-col gap-0.5 border-t border-[var(--color-line)] px-[1.125rem] py-3.5 text-[0.85rem]">
                  <span className="font-semibold">{row.label}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">{row.unit}</span>
                </div>
                {row.cells.map((cell, i) => (
                  <div
                    key={PLANS[i].id}
                    className="border-t border-[var(--color-line)] px-3 py-3.5 text-center text-sm tabular-nums"
                    style={
                      PLANS[i].featured
                        ? { background: "var(--color-accent-100)", color: "var(--color-accent-800)", fontWeight: 600 }
                        : undefined
                    }
                  >
                    {cell}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* What a token is. The same four estimates the wall itemises when it
          refuses a run — published before you pay rather than only at the
          moment we say no. */}
      <section className="mb-9 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-raised)] p-[clamp(1.25rem,3vw,1.625rem)]">
        <h3 className="mb-1.5">What a token is</h3>
        <p className="mb-4 max-w-[56ch] text-[0.85rem] leading-relaxed text-[var(--color-text-muted)]">
          The unit the pipeline actually consumes, measured from every model call rather than
          estimated after the fact. We show it rather than hiding it behind a credit.
        </p>
        <ul className="flex max-w-[34rem] list-none flex-col gap-2 p-0">
          {TOKEN_STAGES.map((stage) => (
            <li key={stage.stage} className="flex items-center gap-3 text-[0.85rem]">
              <span className="min-w-0 flex-1">{stage.stage}</span>
              <span className="hidden h-[5px] w-20 flex-none overflow-hidden rounded-[var(--radius-pill)] bg-[var(--color-bg-sunken)] sm:block">
                <span
                  className="block h-full rounded-[var(--radius-pill)]"
                  style={{
                    width: `${Math.round((stage.estimate / 8400) * 100)}%`,
                    background: "var(--color-sage-600)",
                  }}
                />
              </span>
              <span className="w-14 flex-none text-right tabular-nums text-[var(--color-text-muted)]">
                {formatCount(stage.estimate)}
              </span>
            </li>
          ))}
          <li className="flex items-center gap-3 border-t border-[var(--color-line)] pt-2 text-[0.85rem] font-semibold">
            <span className="min-w-0 flex-1">A full analysis</span>
            <span className="w-14 flex-none text-right tabular-nums">{formatCount(RUN_ESTIMATE)}</span>
          </li>
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
          Coverage, gaps and question frameworks cost nothing. A run that cannot be afforded is
          refused before its first stage, never half-run.
        </p>
      </section>

      {/* Top-ups sit between the plans and the caps table on purpose: they are
          the answer to "what if I run out in week three", and that question is
          asked while looking at the columns above, not after reading them. */}
      <section className="mb-9 rounded-[var(--radius-lg)] border border-[var(--color-line)] p-[clamp(1.25rem,3vw,1.625rem)]">
        <h3 className="mb-1.5">If you run out mid-cycle</h3>
        <p className="mb-5 max-w-[56ch] text-[0.85rem] leading-relaxed text-[var(--color-text-muted)]">
          One-off packs, on any paid plan. They never renew and they never expire — a pack bought in
          the last week of a cycle is not a partial purchase, because anything unspent carries into
          the next one. The plan allowance itself does not carry; only these do.
        </p>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(15rem,100%),1fr))]">
          {TOPUPS.map((topup) => (
            <div
              key={topup.id}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg-raised)] px-4 py-3.5"
            >
              <div>
                <div className="font-semibold tabular-nums">{formatCount(topup.tokens)} tokens</div>
                <div className="text-xs text-[var(--color-text-muted)]">{topup.note}</div>
              </div>
              <span className="font-[family-name:var(--font-heading)] text-[1.25rem]">
                {topup.price}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-9 rounded-[var(--radius-lg)] border border-[var(--color-line)] p-[clamp(1.25rem,3vw,1.625rem)]">
        <h3 className="mb-1.5">What happens when you reach one</h3>
        <p className="mb-5 max-w-[56ch] text-[0.85rem] leading-relaxed text-[var(--color-text-muted)]">
          A cap refuses the next new thing and never takes away something you already have. Each of
          these is enforced at its own seam, which is why running out of one does not read as
          running out of everything.
        </p>

        <div className="flex flex-col gap-3.5">
          {PLAN_ROWS.map((row) => (
            <div key={row.key} className="border-t border-[var(--color-line)] pt-3.5">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
                <span className="text-[0.9rem] font-semibold">{row.label}</span>
                <span className="text-xs text-[var(--color-text-muted)]">{row.unit}</span>
              </div>
              <p className="text-[0.8rem] leading-relaxed text-[var(--color-text-muted)]">
                {row.note}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* The refusals. Same shape as the four stages on /how-it-works, and here
          for the same reason — a price is a promise, so it should say what it
          is not promising. */}
      <section className="mb-9 border-t border-[var(--color-line)] pt-6">
        <h3 className="mb-3.5">What paying does not buy</h3>
        <div className="flex flex-col gap-2">
          {PRICING_REFUSALS.map((line) => (
            <Bullet key={line}>{line}</Bullet>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/how-it-works" className="btn btn-primary no-underline">
          How it works
        </Link>
        <Link href="/support" className="btn btn-ghost no-underline">
          Support us instead
        </Link>
        <span className="min-w-[min(220px,100%)] flex-1 text-xs text-[var(--color-text-muted)]">
          Prices in INR, inclusive of tax. Cancel from your profile at any time.
        </span>
      </div>
    </div>
  );
}

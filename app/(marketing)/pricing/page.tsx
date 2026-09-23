import { Fragment } from "react";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
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
import { JsonLd } from "@/components/json-ld";
import { breadcrumbSchema, graph, softwareSchema } from "@/lib/seo/schema";

export const metadata: Metadata = pageMetadata({
  title: "Pricing: free resume tailoring, Pro ₹499/month",
  description:
    "Tailor your résumé free — 3 analyses a month. Pro (₹499/month) unlocks all 11 ATS-rated templates, job search and more; Ultra (₹1,299) for coaches.",
  path: "/pricing",
});

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
    <div>
      <JsonLd
        data={graph(
          softwareSchema(),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Pricing", path: "/pricing" },
          ]),
        )}
      />
      <PageIntro kicker="Pricing" title="Pay for the runs, not for the seat">
        Every plan does the same four-stage analysis with the same fabrication boundary. What
        changes is how much of it you can do — metered in tokens, measured from what the models
        actually consumed, at about {formatCount(RUN_ESTIMATE)} for a full run.
      </PageIntro>

      <div className="mb-[clamp(3rem,6vw,4.5rem)] grid items-stretch gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(290px,100%),1fr))]">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`flex flex-col gap-4 rounded-[var(--radius-xl)] px-[26px] py-7 ${
              plan.featured ? "bg-[var(--color-accent-500)]" : "bg-[var(--color-bg-raised)]"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="display text-[28px] uppercase">{plan.name}</span>
              {plan.featured ? (
                <Tag tone="sage" className="min-h-[30px] font-extrabold">
                  Most people want this
                </Tag>
              ) : null}
            </div>

            <div className="flex items-baseline gap-2">
              <span className="display text-[64px] leading-[0.9]">{plan.price}</span>
              <span className="text-sm font-semibold">{plan.unit}</span>
            </div>

            <p className="flex-1 text-[15px] leading-relaxed">{plan.tagline}</p>

            {/* The numbers, in the plan's own card as well as in the table
                below — someone comparing three columns should not have to hold
                a row heading in their head to read one. */}
            <dl className="flex flex-col gap-2 border-t border-[var(--color-line)] pt-3.5">
              {PLAN_ROWS.map((row) => (
                <div key={row.key} className="flex items-baseline justify-between gap-3 text-sm">
                  <dt className="opacity-80">{row.label}</dt>
                  <dd className="font-extrabold tabular-nums">
                    {displayCap(row.key, plan.caps[row.key])}
                    <span className="ml-1 text-xs font-medium opacity-75">{row.unit}</span>
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
                className="min-h-[50px] w-full"
              />
            ) : (
              <Link href="/onboarding" className="btn btn-secondary min-h-[50px] w-full no-underline">
                {plan.cta}
              </Link>
            )}
          </div>
        ))}
      </div>

      <div className="mb-[clamp(2.5rem,5vw,4rem)] grid gap-[clamp(1.5rem,4vw,3.5rem)] [grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))]">
        {/* What a token is. The same four estimates the wall itemises when it
            refuses a run — published before you pay rather than only at the
            moment we say no. */}
        <section>
          <h2 className="mb-2.5 text-[40px] leading-none">What a token is</h2>
          <p className="mb-[18px] max-w-[56ch] text-[15px] leading-relaxed text-[var(--color-text-muted)]">
            The unit the pipeline actually consumes, measured from every model call rather than
            estimated after the fact. We show it rather than hiding it behind a credit.
          </p>
          <ul className="flex list-none flex-col p-0">
            {TOKEN_STAGES.map((stage) => (
              <li key={stage.stage} className="flex items-center gap-3.5 py-1.5 text-[15px]">
                <span className="min-w-0 flex-1">{stage.stage}</span>
                <span className="h-1.5 w-24 flex-none overflow-hidden rounded-[var(--radius-pill)] bg-[rgb(74_13_13/0.1)]">
                  <span
                    className="block h-full rounded-[var(--radius-pill)] bg-[var(--color-accent-600)]"
                    style={{ width: `${Math.round((stage.estimate / 8400) * 100)}%` }}
                  />
                </span>
                <span className="w-[60px] flex-none text-right tabular-nums text-[var(--color-text-muted)]">
                  {formatCount(stage.estimate)}
                </span>
              </li>
            ))}
            <li className="mt-1.5 flex items-center justify-between border-t border-[var(--color-line)] pt-2.5 text-[15px] font-extrabold">
              <span>A full analysis</span>
              <span className="tabular-nums">{formatCount(RUN_ESTIMATE)}</span>
            </li>
          </ul>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-text-muted)]">
            Coverage, gaps and question frameworks cost nothing. A run that cannot be afforded is
            refused before its first stage, never half-run.
          </p>
        </section>

        {/* Top-ups sit beside the token breakdown on purpose: they are the
            answer to "what if I run out in week three", and that question is
            asked while looking at what a run costs. */}
        <section>
          <h2 className="mb-2.5 text-[40px] leading-none">If you run out mid-cycle</h2>
          <p className="mb-[18px] max-w-[56ch] text-[15px] leading-relaxed text-[var(--color-text-muted)]">
            One-off packs, on any paid plan. They never renew and they never expire — a pack bought
            in the last week of a cycle is not a partial purchase, because anything unspent carries
            into the next one. The plan allowance itself does not carry; only these do.
          </p>
          <div className="flex flex-col gap-3">
            {TOPUPS.map((topup) => (
              <div
                key={topup.id}
                className="flex items-center justify-between gap-3 rounded-[20px] bg-[var(--color-bg-raised)] px-5 py-4"
              >
                <div>
                  <div className="text-base font-extrabold tabular-nums">
                    {formatCount(topup.tokens)} tokens
                  </div>
                  <div className="text-[13px] text-[var(--color-text-muted)]">{topup.note}</div>
                </div>
                <span className="display text-[32px]">{topup.price}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Side by side. Every row is a cap the code enforces — see COMPARE_ROWS
          for the three the design carries that this deliberately omits. The
          grid scrolls inside its own rounded box rather than widening the page;
          a comparison table is the one layout that cannot reflow. */}
      <section className="mb-[clamp(2.5rem,5vw,4rem)]">
        <h2 className="mb-2.5 text-[40px] leading-none">Side by side</h2>
        <p className="mb-5 max-w-[56ch] text-[15px] leading-relaxed text-[var(--color-text-muted)]">
          Every row is a number enforced at its own seam. Nothing here is a feature list — if it is
          on this table, there is a constraint behind it.
        </p>
        <div className="table-scroll rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)]">
          <div className="grid min-w-[36rem] [grid-template-columns:minmax(11rem,1.6fr)_repeat(3,minmax(6rem,1fr))]">
            <div className="eyebrow px-6 py-4">What you get</div>
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`display px-3 py-4 text-center text-xl ${
                  plan.featured ? "bg-[var(--color-accent-500)]" : ""
                }`}
              >
                {plan.name}
              </div>
            ))}

            {COMPARE_ROWS.map((row) => (
              <Fragment key={row.label}>
                <div className="flex flex-col gap-0.5 border-t border-[var(--color-line)] px-6 py-3.5 text-sm">
                  <span className="font-bold">{row.label}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">{row.unit}</span>
                </div>
                {row.cells.map((cell, i) => (
                  <div
                    key={PLANS[i].id}
                    className={`border-t border-[var(--color-line)] px-3 py-3.5 text-center text-sm tabular-nums ${
                      PLANS[i].featured ? "bg-[var(--color-accent-100)] font-extrabold" : ""
                    }`}
                  >
                    {cell}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-[clamp(2.5rem,5vw,4rem)]">
        <h2 className="mb-2.5 text-[40px] leading-none">What happens when you reach one</h2>
        <p className="mb-5 max-w-[56ch] text-[15px] leading-relaxed text-[var(--color-text-muted)]">
          A cap refuses the next new thing and never takes away something you already have. Each of
          these is enforced at its own seam, which is why running out of one does not read as
          running out of everything.
        </p>
        <div className="grid gap-x-10 gap-y-4 [grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))]">
          {PLAN_ROWS.map((row) => (
            <div key={row.key} className="border-t border-[var(--color-line)] pt-3.5">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
                <span className="text-[15px] font-extrabold">{row.label}</span>
                <span className="text-xs text-[var(--color-text-muted)]">{row.unit}</span>
              </div>
              <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">{row.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The refusals. Same shape as the four stages on /how-it-works, and here
          for the same reason — a price is a promise, so it should say what it
          is not promising. */}
      <div className="mb-[clamp(2rem,4vw,3rem)] h-px bg-[var(--color-line)]" />
      <h2 className="mb-5 text-[40px] leading-none">What paying does not buy</h2>
      <div className="mb-10 grid gap-x-10 gap-y-3 [grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))]">
        {PRICING_REFUSALS.map((line) => (
          <Bullet key={line}>{line}</Bullet>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/how-it-works" className="btn btn-primary min-h-12 no-underline">
          How it works
        </Link>
        <Link href="/support" className="btn btn-ghost min-h-12 no-underline">
          Support us instead
        </Link>
        <span className="min-w-[min(220px,100%)] flex-1 text-[13px] text-[var(--color-text-muted)]">
          Prices in INR, inclusive of tax. Cancel from your profile at any time.
        </span>
      </div>
    </div>
  );
}

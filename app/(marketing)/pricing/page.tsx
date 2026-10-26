import { Fragment } from "react";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { PageIntro, Bullet } from "@/components/page-intro";
import { Tag } from "@/components/ui";
import { displayCap } from "@/lib/domain/quotas";
import { Check, ChevronRight, Minus } from "lucide-react";
import { FaqList } from "@/components/faq-list";
import { BILLING_FAQ, compareRows, PLAN_ROWS, PRICING_REFUSALS, TOPUPS } from "@/lib/content/pricing";
import { loadPlans } from "@/lib/services/plans/catalog";
import { PlanCheckout } from "@/components/plan-checkout";
import { db } from "@/lib/db";
import { settlePlan } from "@/lib/db/queries/plan";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbSchema, faqSchema, graph, softwareSchema } from "@/lib/seo/schema";

/** Built from the live catalog (F31) — a title quoting last month's price is a lie in a search result. */
export async function generateMetadata(): Promise<Metadata> {
  const plans = await loadPlans();
  const [free, pro, ultra] = plans;
  return pageMetadata({
    title: `Pricing: free resume tailoring, ${pro.name} ${pro.price}/month`,
    description: `Tailor your résumé free — ${free.caps.analyses} analyses a month. ${pro.name} (${pro.price}/month) unlocks more templates, job search and more; ${ultra.name} (${ultra.price}) for coaches.`,
    path: "/pricing",
  });
}

/**
 * F17 — pricing.
 *
 * Every number on this page is a cap the code enforces (lib/services/plans/catalog.ts —
 * the admin-editable catalog over the defaults in lib/content/pricing.ts),
 * so the table cannot drift from what actually happens when you reach one. The
 * refusals at the bottom are there for the same reason the four pipeline stages
 * publish theirs: this is the page a product is most tempted to overclaim on.
 */
export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ promo?: string; coupon?: string }>;
}) {
  const plans = await loadPlans();
  const COMPARE_ROWS = compareRows(plans);
  // `?coupon=` is the name most shared links use; `?promo=` is ours. Same field.
  const { promo, coupon } = await searchParams;
  const code = promo ?? coupon;
  const initialCode = typeof code === "string" && code.length <= 24 ? code : undefined;
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
          softwareSchema(plans),
          faqSchema(BILLING_FAQ),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Pricing", path: "/pricing" },
          ]),
        )}
      />
      <PageIntro kicker="Pricing" title="Pay for the runs, not for the seat">
        Same analysis on every plan. Only how much of it you can run changes.
      </PageIntro>

      {/* Plan cards. Order inside a card is: who it's for, what it costs, the
          button, then what you get — the decision is made at the price, so the
          button sits there rather than below seven rows of caps. */}
      <div className="grid items-stretch gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(290px,100%),1fr))]">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`flex flex-col gap-5 rounded-[var(--radius-xl)] px-[26px] py-7 ${
              plan.featured ? "bg-[var(--color-accent-500)]" : "bg-[var(--color-bg-raised)]"
            }`}
          >
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="display text-[28px] uppercase">{plan.name}</span>
                {plan.featured ? (
                  <Tag tone="ink" className="ml-auto min-h-[30px] font-extrabold">
                    Most popular
                  </Tag>
                ) : currentPlanId === plan.id ? (
                  <Tag tone="outline" className="ml-auto min-h-[30px] font-extrabold">
                    Your plan
                  </Tag>
                ) : null}
              </div>
              <p className="text-[15px] leading-relaxed opacity-80">{plan.tagline}</p>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="display text-[64px] leading-[0.9]">{plan.price}</span>
              <span className="text-sm font-semibold">{plan.unit}</span>
            </div>

            {plan.pricePaise > 0 ? (
              <PlanCheckout
                planId={plan.id}
                planName={plan.name}
                listPrice={plan.price}
                label={currentPlanId === plan.id ? `Renew ${plan.name}` : plan.cta}
                variant={plan.featured ? "primary" : "secondary"}
                initialCode={initialCode}
              />
            ) : (
              <Link href="/onboarding" className="btn btn-secondary min-h-[50px] w-full no-underline">
                {plan.cta}
              </Link>
            )}

            {/* The numbers, in the plan's own card as well as in the table
                below — someone comparing three columns should not have to hold
                a row heading in their head to read one. A cap at zero reads as
                a dash, not a tick: the row is shown so its absence is visible. */}
            <ul className="flex list-none flex-col gap-2.5 border-t border-[var(--color-line)] p-0 pt-4">
              {PLAN_ROWS.map((row) => {
                const on = plan.caps[row.key] !== 0;
                return (
                  <li
                    key={row.key}
                    className={`flex items-center gap-2.5 text-sm ${on ? "" : "opacity-55"}`}
                  >
                    {on ? (
                      <Check aria-hidden className="lucide h-4 w-4 flex-none" strokeWidth={2.25} />
                    ) : (
                      <Minus aria-hidden className="lucide h-4 w-4 flex-none" strokeWidth={2.25} />
                    )}
                    <span className="min-w-0 flex-1">{row.label}</span>
                    <span className="font-extrabold tabular-nums">
                      {displayCap(row.key, plan.caps[row.key])}
                      <span className="ml-1 text-xs font-medium opacity-75">{row.unit}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="mb-[clamp(3rem,6vw,4.5rem)] mt-4 text-[13px] text-[var(--color-text-muted)]">
        Prices in INR, inclusive of tax. A paid plan lasts 30 days from payment and never renews
        itself — there is nothing to cancel. Fair-use limit applies.
      </p>

      {/* Packs answer "what if I run out in week three" — in analyses, the
          unit the cards above print, never in tokens (counts-only pricing). */}
      <section className="mb-[clamp(2.5rem,5vw,4rem)] max-w-[640px]">
        <h2 className="mb-2.5 text-[40px] leading-none">Need more analyses?</h2>
        <p className="mb-[18px] max-w-[56ch] text-[15px] leading-relaxed text-[var(--color-text-muted)]">
          One-off packs on any paid plan, used after the month&rsquo;s analyses. They never renew and
          never expire.
        </p>
        <div className="flex flex-col gap-3">
          {TOPUPS.map((topup) => (
            <div
              key={topup.id}
              className="flex items-center justify-between gap-3 rounded-[20px] bg-[var(--color-bg-raised)] px-5 py-4"
            >
              <div>
                <div className="text-base font-extrabold tabular-nums">+{topup.analyses} analyses</div>
                <div className="text-[13px] text-[var(--color-text-muted)]">{topup.note}</div>
              </div>
              <span className="display text-[32px]">{topup.price}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Side by side. Every row is a cap the code enforces — see COMPARE_ROWS
          for the three the design carries that this deliberately omits. The
          grid scrolls inside its own rounded box rather than widening the page;
          a comparison table is the one layout that cannot reflow. */}
      <section className="mb-[clamp(2.5rem,5vw,4rem)]">
        <h2 className="mb-5 text-[40px] leading-none">Side by side</h2>
        <div className="table-scroll rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)]">
          <div className="grid min-w-[36rem] [grid-template-columns:minmax(11rem,1.6fr)_repeat(3,minmax(6rem,1fr))]">
            <div className="eyebrow px-6 py-4">What you get</div>
            {plans.map((plan) => (
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
                    key={plans[i].id}
                    className={`border-t border-[var(--color-line)] px-3 py-3.5 text-center text-sm tabular-nums ${
                      plans[i].featured ? "bg-[var(--color-accent-100)] font-extrabold" : ""
                    }`}
                  >
                    {cell === "✓" ? (
                      <Check aria-label="Included" className="lucide mx-auto h-4 w-4" strokeWidth={2.25} />
                    ) : cell === "—" ? (
                      <Minus
                        aria-label="Not included"
                        className="lucide mx-auto h-4 w-4 text-[var(--color-text-muted)]"
                        strokeWidth={2.25}
                      />
                    ) : (
                      cell
                    )}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
        {/* What each cap does when you reach it — one tap away rather than a
            wall of seven paragraphs. A cap refuses the next new thing and never
            takes away something you already have. */}
        <details className="group mt-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-extrabold [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden className="lucide h-4 w-4 transition-transform group-open:rotate-90" strokeWidth={2.25} />
            What happens when you reach a cap
          </summary>
          <dl className="mt-3 grid gap-x-10 gap-y-3 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
            {PLAN_ROWS.map((row) => (
              <div key={row.key} className="border-t border-[var(--color-line)] pt-3">
                <dt className="mb-1 text-sm font-extrabold">{row.label}</dt>
                <dd className="text-sm leading-relaxed text-[var(--color-text-muted)]">{row.note}</dd>
              </div>
            ))}
          </dl>
        </details>
      </section>


      {/* Billing questions — the same pairs as the FAQPage JSON-LD above. */}
      <div className="mb-[clamp(2.5rem,5vw,4rem)]">
        <FaqList faqs={BILLING_FAQ} title="Billing questions" />
      </div>

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
      </div>
    </div>
  );
}

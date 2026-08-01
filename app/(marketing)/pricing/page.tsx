import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro, Bullet } from "@/components/page-intro";
import { Tag } from "@/components/ui";
import { displayCap } from "@/lib/domain/quotas";
import { PLANS, PLAN_ROWS, PRICING_REFUSALS } from "@/lib/content/pricing";
import { ProCheckoutButton } from "./checkout-button";

export const metadata: Metadata = {
  title: "Pricing · Roleform",
  description:
    "Two plans, priced on how much you run rather than on which features you're allowed. Nothing behind the paywall changes what the product will say about you.",
};

/**
 * F17 — pricing.
 *
 * Every number on this page is a cap the code enforces (lib/content/pricing.ts),
 * so the table cannot drift from what actually happens when you reach one. The
 * refusals at the bottom are there for the same reason the four pipeline stages
 * publish theirs: this is the page a product is most tempted to overclaim on.
 */
export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-[1000px] px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1.75rem,5vw,3.5rem)] pb-16">
      <PageIntro kicker="Pricing" title="Priced on how much you run, not on what you're allowed to see">
        Both plans use the same pipeline, the same six templates and the same fabrication boundary.
        What differs is volume — how many postings, how many drafts, how many worked answers.
      </PageIntro>

      <div className="mb-10 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
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

            {/* The four numbers, in the plan's own card as well as in the table
                below — someone comparing two columns should not have to hold a
                row heading in their head to read one. */}
            <dl className="flex flex-col gap-2 border-t border-[var(--color-line)] pt-3.5">
              {PLAN_ROWS.map((row) => (
                <div key={row.key} className="flex items-baseline justify-between gap-3 text-[0.85rem]">
                  <dt className="text-[var(--color-text-muted)]">{row.label}</dt>
                  <dd className="font-semibold tabular-nums">
                    {displayCap(plan.caps[row.key])}
                    <span className="ml-1 text-xs font-normal text-[var(--color-text-muted)]">
                      {row.unit}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>

            {plan.id === "pro" ? (
              <ProCheckoutButton label={plan.cta} />
            ) : (
              <Link href="/onboarding" className="btn btn-secondary w-full no-underline">
                {plan.cta}
              </Link>
            )}
          </div>
        ))}
      </div>

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
        <span className="min-w-[220px] flex-1 text-xs text-[var(--color-text-muted)]">
          Prices in INR, inclusive of tax. Cancel from your profile at any time.
        </span>
      </div>
    </div>
  );
}

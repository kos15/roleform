import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { SPEND_BASIS, SUPPORT_SPEND, SUPPORT_TIERS } from "@/lib/content/support";

export const metadata: Metadata = {
  title: "Support us · Roleform",
  description:
    "Independent, ad-free, and paid for by the people who use it. No recruiter side, no affiliate links.",
};

export default function SupportPage() {
  return (
    <div className="mx-auto w-full max-w-[1000px] px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1.75rem,5vw,3.5rem)] pb-16">
      <PageIntro
        kicker="Support us"
        title="Independent, ad-free, and paid for by people who use it"
      >
        No recruiter side of the product, no affiliate links in the course catalog, no selling
        profiles. That only stays true if the money comes from you.
      </PageIntro>

      <div className="mb-9 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
        {SUPPORT_TIERS.map((tier) => (
          <div
            key={tier.name}
            className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-raised)] p-[1.375rem]"
          >
            <div className="font-[family-name:var(--font-heading)] text-[1.1875rem]">
              {tier.name}
            </div>
            <div className="flex items-baseline gap-[7px]">
              <span className="font-[family-name:var(--font-heading)] text-3xl leading-none">
                {tier.price}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">{tier.unit}</span>
            </div>
            <p className="flex-1 text-[0.85rem] leading-relaxed text-[var(--color-text-muted)]">
              {tier.description}
            </p>
            <Link
              href="/contact"
              className={`btn ${tier.featured ? "btn-primary" : "btn-secondary"} w-full no-underline`}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>

      <section className="mb-6 rounded-[var(--radius-lg)] border border-[var(--color-line)] p-[clamp(1.25rem,3vw,1.625rem)]">
        <h3 className="mb-1.5">Where it goes</h3>
        <p className="mb-1 max-w-[56ch] text-[0.85rem] leading-relaxed text-[var(--color-text-muted)]">
          We publish this because a product that vets courses should be able to say who pays for
          the vetting.
        </p>
        {/* The label is doing real work: a forecast presented as a report is the
            same class of lie as an "ATS score" (N4). */}
        <p className="mb-5 max-w-[56ch] text-[0.8rem] text-accent-body">{SPEND_BASIS}</p>

        <div className="flex flex-col gap-3.5">
          {SUPPORT_SPEND.map((line) => (
            <div key={line.label}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="text-[0.9rem] font-semibold">{line.label}</span>
                <span className="text-[0.8rem] tabular-nums text-[var(--color-text-muted)]">
                  {line.pct}%
                </span>
              </div>
              <div className="mb-1.5 h-[7px] overflow-hidden rounded-[var(--radius-pill)] bg-[var(--color-bg-sunken)]">
                <div
                  className="h-full rounded-[var(--radius-pill)] bg-[var(--color-sage-500)]"
                  style={{ width: `${line.pct}%` }}
                />
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">{line.note}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/analyze" className="btn btn-primary no-underline">
          Back to your analysis
        </Link>
        <Link href="/how-it-works" className="btn btn-ghost no-underline">
          How it works
        </Link>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { SPEND_BASIS, SUPPORT_SPEND, SUPPORT_TIERS } from "@/lib/content/support";

export const metadata: Metadata = {
  title: "Support us · Roleform",
  description:
    "Independent, ad-free, and paid for by people who use it. No recruiter side, no affiliate links.",
};

/** One bar colour per line, so the three read as separate slices. */
const SPEND_COLOURS = [
  "var(--color-sage-600)",
  "var(--color-accent-600)",
  "var(--color-text)",
];

export default function SupportPage() {
  return (
    <div>
      <PageIntro
        kicker="Support us"
        title="Independent, ad-free, and paid for by people who use it"
      >
        No recruiter side of the product, no affiliate links in the course catalog, no selling
        profiles. That only stays true if the money comes from you.
      </PageIntro>

      <div className="mb-[clamp(2.25rem,5vw,3.5rem)] grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
        {SUPPORT_TIERS.map((tier) => (
          <div
            key={tier.name}
            className={`flex flex-col gap-3.5 rounded-[26px] px-6 py-[26px] ${
              tier.featured ? "bg-[var(--color-accent-500)]" : "bg-[var(--color-bg-raised)]"
            }`}
          >
            <div className="display text-[26px]">
              {tier.name}
            </div>
            <div className="flex items-baseline gap-[7px]">
              <span className="display text-[56px] leading-[0.9]">
                {tier.price}
              </span>
              <span className="text-sm font-semibold">{tier.unit}</span>
            </div>
            <p className="flex-1 text-[15px] leading-relaxed">
              {tier.description}
            </p>
            <Link
              href="/contact"
              className={`btn ${tier.featured ? "btn-primary" : "btn-secondary"} min-h-12 w-full no-underline`}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>

      <section className="mb-7 rounded-[var(--radius-xl)] bg-[var(--color-bg-raised)] p-[clamp(1.4rem,3vw,2.1rem)]">
        <h2 className="mb-2.5 text-[38px] leading-none">Where it goes</h2>
        <p className="mb-1.5 max-w-[56ch] text-[15.5px] leading-relaxed text-[var(--color-text-muted)]">
          We publish this because a product that vets courses should be able to say who pays for
          the vetting.
        </p>
        {/* The label is doing real work: a forecast presented as a report is the
            same class of lie as an "ATS score" (N4). */}
        <p className="mb-6 inline-block rounded-[8px] bg-[var(--color-accent-200)] px-2.5 py-1 text-sm font-bold">
          {SPEND_BASIS}
        </p>

        <div className="flex flex-col gap-5">
          {SUPPORT_SPEND.map((line, i) => (
            <div key={line.label}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="text-[17px] font-extrabold">{line.label}</span>
                <span className="display text-[28px] tabular-nums">
                  {line.pct}%
                </span>
              </div>
              <div className="mb-2 h-3 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--color-bg-sunken)]">
                <div
                  className="h-full rounded-[var(--radius-pill)]"
                  style={{ width: `${line.pct}%`, background: SPEND_COLOURS[i % SPEND_COLOURS.length] }}
                />
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">{line.note}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-2.5">
        <Link href="/analyze" className="btn btn-primary min-h-12 no-underline">
          Back to your analysis
        </Link>
        <Link href="/how-it-works" className="btn btn-ghost min-h-12 no-underline">
          How it works
        </Link>
      </div>
    </div>
  );
}

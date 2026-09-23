import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TEMPLATES, ratingFor } from "@/lib/render/templates";
import { ATS_CHECKS, atsViolations } from "@/lib/render/ats-rules";
import { pageMetadata } from "@/lib/seo/metadata";
import { breadcrumbSchema, graph, templatesSchema, faqSchema } from "@/lib/seo/schema";
import { JsonLd } from "@/components/json-ld";
import { PageIntro } from "@/components/page-intro";
import { TemplateThumb } from "@/components/template-thumb";
import { AtsBadge, Tag } from "@/components/ui";
import { FaqList } from "@/components/faq-list";

export const metadata: Metadata = pageMetadata({
  title: `ATS-friendly resume templates: ${TEMPLATES.length} layouts, honestly rated`,
  description: `Every Roleform resume template with the ATS rating it earns from five structural rules — single-column High, sidebar Medium, creative Low — and when to use each.`,
  path: "/templates",
});

const FAQS = [
  {
    q: "Which résumé template is best for applicant tracking systems?",
    a: `A single-column layout with standard headings. Of Roleform's ${TEMPLATES.length} templates, ${TEMPLATES.filter((t) => ratingFor(t.id) === "High").map((t) => t.name).join(", ")} meet all five structural rules and rate High.`,
  },
  {
    q: "Why do creative résumé templates rate Low?",
    a: "They break two or more structural rules — usually a second column, icon-only contact details or information carried by colour — each of which can scramble or drop text when a parser extracts it.",
  },
  {
    q: "Are the templates free?",
    a: "The Free plan renders the two highest-rated templates for each analysis. Pro and Ultra render all eleven.",
  },
];

/**
 * The template shelf, public (N5). Each rating is read from ratingFor — the
 * same computed value the product shows — and each card lists the rules its
 * layout breaks, so the page answers "which templates are ATS-friendly" with
 * reasons rather than adjectives.
 */
export default function TemplatesPage() {
  return (
    <div>
      <JsonLd
        data={graph(
          templatesSchema(),
          faqSchema(FAQS),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Résumé templates", path: "/templates" },
          ]),
        )}
      />
      <PageIntro kicker="Résumé templates" title="ATS-friendly templates, honestly rated">
        {TEMPLATES.length} layouts across eight families. Each one&rsquo;s ATS rating is computed from five
        structural rules — all five met is High, one broken is Medium, two or more is Low. The creative
        ones rate Low because they are, and we&rsquo;d rather you choose knowingly.
      </PageIntro>

      <section aria-labelledby="rules" className="mb-[clamp(2.5rem,5vw,4rem)] rounded-[var(--radius-xl)] bg-[var(--color-accent-500)] p-[clamp(1.4rem,3vw,2rem)]">
        <h2 id="rules" className="mb-4 text-[clamp(2rem,3.6vw,2.75rem)] leading-none">The five rules</h2>
        <ol className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
          {ATS_CHECKS.map((c, i) => (
            <li key={c.key} className="flex gap-3 rounded-[18px] bg-[var(--color-bg-raised)] px-4 py-3.5">
              <span className="display text-2xl leading-none text-[var(--color-accent-600)]">0{i + 1}</span>
              <span className="text-[15px] font-semibold leading-snug">{c.label}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm">
          Read the full explanation:{" "}
          <Link href="/guides/ats-friendly-resume" className="font-extrabold">
            What makes a résumé ATS-friendly?
          </Link>
        </p>
      </section>

      <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]">
        {TEMPLATES.map((t) => {
          const violations = atsViolations(t.structuralFlags);
          return (
            <article
              key={t.id}
              id={t.id}
              className="flex scroll-mt-28 flex-col gap-3.5 rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)] px-3.5 pb-[18px] pt-3.5"
            >
              <TemplateThumb template={t} />
              <div className="px-1.5">
                <h3 className="mb-1.5 text-[19px]">{t.name}</h3>
                <p className="text-sm leading-normal text-[var(--color-text-muted)]">{t.blurb}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 px-1.5">
                <Tag tone="outline" className="border-[var(--color-line-strong)] capitalize">
                  {t.kind}
                </Tag>
                <AtsBadge rating={ratingFor(t.id)} />
              </div>
              <p className="mt-auto px-1.5 text-[13px] leading-normal text-[var(--color-text-muted)]">
                {violations.length === 0
                  ? "Meets all five structural rules."
                  : `Breaks: ${violations.join("; ")}.`}
              </p>
            </article>
          );
        })}
      </div>

      <FaqList faqs={FAQS} />

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Link href="/sign-up" className="btn btn-primary btn-lg no-underline">
          Tailor my résumé into these <ArrowRight className="lucide h-[18px] w-[18px]" />
        </Link>
        <Link href="/guides" className="btn btn-ghost no-underline">
          Read the guides
        </Link>
      </div>
    </div>
  );
}

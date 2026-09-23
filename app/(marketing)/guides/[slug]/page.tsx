import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { GUIDES, guideBySlug } from "@/lib/content/guides";
import { guideSchemas, graph } from "@/lib/seo/schema";
import { pageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/json-ld";
import { FaqList } from "@/components/faq-list";

/**
 * A guide (lib/content/guides.ts). Statically generated — the content is in
 * the repo — so every crawler and agent gets the full text in the first HTML
 * response, no JavaScript required.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const guide = guideBySlug((await params).slug);
  if (!guide) return {};
  const base = pageMetadata({
    title: guide.seoTitle,
    description: guide.description,
    path: `/guides/${guide.slug}`,
  });
  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: "article",
      modifiedTime: guide.updated,
      publishedTime: guide.updated,
    },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const guide = guideBySlug((await params).slug);
  if (!guide) notFound();

  const related = guide.related.map(guideBySlug).filter((g) => g !== undefined);
  let stepNo = 0;

  return (
    <article>
      <JsonLd data={graph(...guideSchemas(guide))} />

      <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/" className="font-bold no-underline">Home</Link>
        <span aria-hidden>/</span>
        <Link href="/guides" className="font-bold no-underline">Guides</Link>
        <span aria-hidden>/</span>
        <span className="text-[var(--color-text-muted)]">{guide.title}</span>
      </nav>

      <header className="mb-[clamp(2rem,4vw,3rem)] max-w-[72ch]">
        <p className="eyebrow mb-3.5">{guide.kicker}</p>
        <h1 className="mb-5 text-[clamp(2.75rem,6vw,5.5rem)] leading-[0.92]">{guide.title}</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Updated{" "}
          <time dateTime={guide.updated}>
            {new Date(guide.updated).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </time>{" "}
          · {guide.readMinutes} min read · by the Roleform team
        </p>
      </header>

      {/* The short answer, first. It is the passage an answer engine lifts, and
          the one a skimming reader needs. */}
      <section
        aria-label="Short answer"
        className="mb-[clamp(2.5rem,5vw,4rem)] max-w-[80ch] rounded-[var(--radius-lg)] bg-[var(--color-accent-500)] px-[clamp(1.25rem,3vw,2rem)] py-6"
      >
        <p className="eyebrow mb-2 text-[var(--color-text)]">The short answer</p>
        <p className="text-[clamp(17px,1.6vw,19px)] font-semibold leading-relaxed">{guide.answer}</p>
      </section>

      <div className="flex flex-col">
        {guide.sections.map((section) => (
          <section
            key={section.heading}
            className="grid gap-x-[clamp(1.5rem,4vw,4rem)] gap-y-[18px] border-t border-[var(--color-line)] py-[clamp(1.5rem,3vw,2.25rem)] [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]"
          >
            <h2 className="text-[clamp(1.6rem,2.8vw,2.3rem)] leading-none">{section.heading}</h2>
            <div className="flex max-w-[64ch] flex-col gap-3.5">
              {section.body?.map((para) => (
                <p key={para} className="text-[16.5px] leading-[1.7]">
                  {para}
                </p>
              ))}
              {section.steps?.length ? (
                <ol className="flex flex-col gap-3">
                  {section.steps.map((step) => {
                    stepNo += 1;
                    return (
                      <li key={step.name} className="flex gap-4 rounded-[18px] bg-[var(--color-bg-raised)] px-5 py-4">
                        <span className="display flex-none text-[28px] leading-none text-[var(--color-accent-600)]">
                          {String(stepNo).padStart(2, "0")}
                        </span>
                        <span>
                          <strong className="block text-base">{step.name}</strong>
                          <span className="text-[15px] leading-relaxed text-[var(--color-text-muted)]">
                            {step.text}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
              {section.list?.length ? (
                <ul className="flex flex-col gap-2">
                  {section.list.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 rounded-[var(--radius-sm)] bg-[var(--color-accent-100)] px-3.5 py-[11px] text-[15px] font-semibold leading-[1.55]"
                    >
                      <span aria-hidden className="mt-[7px] h-2 w-2 flex-none rounded-[var(--radius-pill)] bg-[var(--color-sage-600)]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        ))}
      </div>

      <FaqList faqs={guide.faqs} />

      <section className="mt-[clamp(3rem,6vw,4.5rem)] grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
        <div className="rounded-[var(--radius-xl)] bg-[var(--color-sage-500)] p-[clamp(1.4rem,3vw,2rem)]">
          <h2 className="mb-3 text-[clamp(2rem,3.6vw,2.75rem)] leading-none">Do it on your own résumé</h2>
          <p className="mb-5 max-w-[46ch] text-base leading-relaxed">
            Paste a job description and Roleform does the matching, reordering and rewording — from your
            own bullets, with every gap listed instead of papered over. Free to start.
          </p>
          <Link href="/sign-up" className="btn btn-primary no-underline">
            Tailor my résumé <ArrowRight className="lucide h-4 w-4" />
          </Link>
        </div>
        <nav aria-label="Related guides" className="rounded-[var(--radius-xl)] bg-[var(--color-bg-raised)] p-[clamp(1.4rem,3vw,2rem)]">
          <p className="eyebrow mb-4">Related guides</p>
          <ul className="flex flex-col gap-3">
            {related.map((g) => (
              <li key={g.slug}>
                <Link href={`/guides/${g.slug}`} className="text-base font-extrabold">
                  {g.title}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/templates" className="text-base font-extrabold">
                ATS-friendly résumé templates, rated
              </Link>
            </li>
          </ul>
        </nav>
      </section>
    </article>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GUIDES } from "@/lib/content/guides";
import { pageMetadata } from "@/lib/seo/metadata";
import { breadcrumbSchema, graph } from "@/lib/seo/schema";
import { absoluteUrl } from "@/lib/seo/site";
import { JsonLd } from "@/components/json-ld";
import { PageIntro } from "@/components/page-intro";

export const metadata: Metadata = pageMetadata({
  title: "Resume guides: tailoring, ATS, keywords and interview prep",
  description:
    "Practical guides to tailoring a resume for a specific job: matching a job description, ATS-friendly formatting, keywords, skill gaps and predicting interview questions.",
  path: "/guides",
});

export default function GuidesIndex() {
  return (
    <div>
      <JsonLd
        data={graph(
          {
            "@type": "CollectionPage",
            name: "Roleform résumé guides",
            url: absoluteUrl("/guides"),
            hasPart: GUIDES.map((g) => ({
              "@type": "Article",
              headline: g.seoTitle,
              url: absoluteUrl(`/guides/${g.slug}`),
            })),
          },
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Guides", path: "/guides" },
          ]),
        )}
      />
      <PageIntro kicker="Guides" title="Tailor a résumé the honest way">
        Short, practical answers to the questions every application raises — written to the same rules
        Roleform enforces: reorder and reword what you did, never invent what you didn&rsquo;t.
      </PageIntro>

      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))]">
        {GUIDES.map((g, i) => (
          <Link
            key={g.slug}
            href={`/guides/${g.slug}`}
            className={`card card-link flex flex-col gap-3 rounded-[26px] p-7 no-underline ${
              i === 0 ? "card-accent" : ""
            }`}
          >
            <span className={`eyebrow ${i === 0 ? "text-[var(--color-text)]" : ""}`}>{g.kicker}</span>
            <h2 className="text-[clamp(1.75rem,2.8vw,2.3rem)] leading-none">{g.title}</h2>
            <p className={`flex-1 text-[15px] leading-relaxed ${i === 0 ? "" : "text-[var(--color-text-muted)]"}`}>
              {g.answer}
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-extrabold">
              Read the guide · {g.readMinutes} min <ArrowRight className="lucide h-4 w-4" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

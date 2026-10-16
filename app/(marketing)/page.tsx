import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { hasProfile } from "@/lib/db/queries/profile";
import { latestReadyAnalysisId } from "@/lib/db/queries/analysis";
import { TEMPLATES } from "@/lib/render/templates";
import { JsonLd } from "@/components/json-ld";
import { FaqList } from "@/components/faq-list";
import { GUIDES, HOME_FAQS } from "@/lib/content/guides";
import { faqSchema, graph, organizationSchema, softwareSchema, websiteSchema } from "@/lib/seo/schema";
import { loadPlans } from "@/lib/plans/catalog";
import { PromoMarquee } from "@/components/promo-marquee";
import { pageMetadata } from "@/lib/seo/metadata";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/seo/site";
import type { Metadata } from "next";
import { LandingIntro } from "@/components/landing-intro";
import { LandingHome, type LandingHrefs } from "@/components/landing-home";

export const metadata: Metadata = {
  ...pageMetadata({ title: SITE_TITLE, description: SITE_DESCRIPTION, path: "/" }),
  // The home title stands alone rather than going through "%s | Roleform".
  title: { absolute: SITE_TITLE },
};

/**
 * The landing page is the design's hero and tool tour (components/landing-home).
 * Guides and the FAQ follow for search, unchanged.
 *
 * Each tool's button goes where that tool lives for this visitor: a member's
 * newest finished analysis for the per-posting tabs, a new analysis when there
 * is none yet, and sign-in first for a visitor (the app routes require a
 * session — middleware.ts sends them back after).
 */
export default async function MarketingPage() {
  // A member who already imported a résumé is not here to import one again.
  // The button they get is the one for where they actually are.
  const { userId } = await auth();
  const [returning, latest] = userId
    ? await Promise.all([hasProfile(userId), latestReadyAnalysisId(userId)])
    : [false, null];
  const start = !userId ? "/sign-in" : returning ? "/analyze" : "/onboarding";
  const tab = (t: string) => (latest ? `/analysis/${latest}/${t}` : "/analyze");

  const hrefs: LandingHrefs = {
    start,
    jobs: "/jobs",
    analyze: "/analyze",
    resumes: tab("resumes"),
    prep: tab("prep"),
    rapid: tab("rapid"),
    learning: tab("learning"),
    roadmap: tab("roadmap"),
    portfolio: tab("portfolio"),
    history: "/history",
  };

  return (
    <div>
      <LandingIntro drafts={TEMPLATES.length} />
      <JsonLd
        data={graph(organizationSchema(), websiteSchema(), softwareSchema(await loadPlans()), faqSchema(HOME_FAQS))}
      />
      {/* F32: renders nothing unless an admin has a live, advertised code. */}
      <PromoMarquee className="intro-item" />
      <LandingHome hrefs={hrefs} />

      <section aria-labelledby="guides-heading" className="mt-[clamp(3rem,6vw,4.5rem)]">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <h2 id="guides-heading" className="text-[clamp(2rem,4vw,3rem)] leading-none">
            Tailoring, explained
          </h2>
          <Link href="/guides" className="btn btn-secondary btn-sm no-underline">
            All guides
          </Link>
        </div>
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
          {GUIDES.slice(0, 3).map((g) => (
            <li key={g.slug}>
              <Link
                href={`/guides/${g.slug}`}
                className="card card-link flex h-full flex-col gap-2 rounded-[22px] no-underline"
              >
                <span className="eyebrow">{g.kicker}</span>
                <span className="text-lg font-extrabold leading-snug">{g.title}</span>
                <span className="text-sm leading-relaxed text-[var(--color-text-muted)]">
                  {g.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <FaqList faqs={HOME_FAQS} />
    </div>
  );
}

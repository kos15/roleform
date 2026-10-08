import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { hasProfile } from "@/lib/db/queries/profile";
import { TEMPLATES, ratingFor } from "@/lib/render/templates";
import { JsonLd } from "@/components/json-ld";
import { FaqList } from "@/components/faq-list";
import { GUIDES, HOME_FAQS } from "@/lib/content/guides";
import { STORY_LINES } from "@/lib/content/helper";
import { faqSchema, graph, organizationSchema, softwareSchema, websiteSchema } from "@/lib/seo/schema";
import { pageMetadata } from "@/lib/seo/metadata";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/seo/site";
import type { Metadata } from "next";
import { LandingIntro } from "@/components/landing-intro";
import { LandingStory } from "@/components/landing-story";

export const metadata: Metadata = {
  ...pageMetadata({ title: SITE_TITLE, description: SITE_DESCRIPTION, path: "/" }),
  // The home title stands alone rather than going through "%s | Roleform".
  title: { absolute: SITE_TITLE },
};

/**
 * The landing page is the design's scroll story (components/landing-story):
 * one posting read, matched, rewritten and turned into prep as you scroll,
 * then what you get and the closing card. Guides and the FAQ follow for
 * search, unchanged.
 *
 * Every ATS badge in the story is computed here through `ratingFor` (N5), and
 * the draft count is the catalog's own length, never a typed number.
 */
export default async function MarketingPage() {
  // A member who already imported a résumé is not here to import one again.
  // The button they get is the one for where they actually are.
  const { userId } = await auth();
  const returning = userId ? await hasProfile(userId) : false;
  const startHref = !userId ? "/sign-in" : returning ? "/analyze" : "/onboarding";

  const ratings = Object.fromEntries(TEMPLATES.map((t) => [t.name, ratingFor(t.id)]));

  return (
    <div>
      <LandingIntro drafts={TEMPLATES.length} />
      <JsonLd
        data={graph(organizationSchema(), websiteSchema(), softwareSchema(), faqSchema(HOME_FAQS))}
      />
      {/* Full-bleed: the story owns the viewport under the sticky header. */}
      <div className="story-bleed">
        <LandingStory
          templateCount={TEMPLATES.length}
          ratings={ratings}
          startHref={startHref}
          lines={STORY_LINES}
        />
      </div>

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

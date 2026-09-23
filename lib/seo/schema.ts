/**
 * JSON-LD builders (schema.org). Every value is read from the same modules the
 * pages render — plans from lib/content/pricing, ratings from ratingFor (N5),
 * guides from lib/content/guides — so the structured data cannot claim
 * something the visible page doesn't.
 */
import { PLANS } from "@/lib/content/pricing";
import type { Guide } from "@/lib/content/guides";
import { TEMPLATES, ratingFor } from "@/lib/render/templates";
import { FOUNDER, SITE_DEFINITION, SITE_DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl } from "./site";

type Json = Record<string, unknown>;

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;
const APP_ID = `${SITE_URL}/#software`;

export function organizationSchema(): Json {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/icon.svg"),
    description: SITE_DEFINITION,
    founder: { "@type": "Person", name: FOUNDER.name },
    foundingLocation: FOUNDER.location,
    contactPoint: { "@type": "ContactPoint", contactType: "customer support", url: absoluteUrl("/contact") },
  };
}

export function websiteSchema(): Json {
  return {
    "@type": "WebSite",
    "@id": SITE_ID,
    url: SITE_URL,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    publisher: { "@id": ORG_ID },
    inLanguage: "en",
  };
}

export function softwareSchema(): Json {
  return {
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: SITE_NAME,
    url: SITE_URL,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Résumé tailoring and interview preparation",
    operatingSystem: "Web",
    description: SITE_DEFINITION,
    publisher: { "@id": ORG_ID },
    featureList: [
      `Up to ${TEMPLATES.length} tailored résumés per job description`,
      "ATS rating computed from five structural rules for every template",
      "Requirement coverage score with strong, partial and not-evidenced buckets",
      "Interview questions derived from the posting, with answer frameworks",
      "Skill-gap list with vetted courses",
      "DOCX and PDF export",
      "Nothing invented: every generated bullet traces to one you wrote",
    ],
    offers: PLANS.map((plan) => ({
      "@type": "Offer",
      name: plan.name,
      price: (plan.pricePaise / 100).toFixed(2),
      priceCurrency: "INR",
      description: plan.tagline,
      url: absoluteUrl("/pricing"),
      ...(plan.pricePaise > 0
        ? {
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: (plan.pricePaise / 100).toFixed(2),
              priceCurrency: "INR",
              billingDuration: "P1M",
              unitText: "MONTH",
            },
          }
        : {}),
    })),
  };
}

export function faqSchema(faqs: { q: string; a: string }[]): Json {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function guideSchemas(guide: Guide): Json[] {
  const url = absoluteUrl(`/guides/${guide.slug}`);
  const steps = guide.sections.flatMap((s) => s.steps ?? []);
  const out: Json[] = [
    {
      "@type": "Article",
      "@id": `${url}#article`,
      headline: guide.seoTitle,
      description: guide.description,
      abstract: guide.answer,
      url,
      mainEntityOfPage: url,
      datePublished: guide.updated,
      dateModified: guide.updated,
      author: { "@type": "Organization", "@id": ORG_ID, name: SITE_NAME },
      publisher: { "@id": ORG_ID },
      image: absoluteUrl("/opengraph-image"),
      inLanguage: "en",
    },
    faqSchema(guide.faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Guides", path: "/guides" },
      { name: guide.title, path: `/guides/${guide.slug}` },
    ]),
  ];
  if (steps.length >= 3) {
    out.push({
      "@type": "HowTo",
      name: guide.title,
      description: guide.answer,
      step: steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.name, text: s.text })),
    });
  }
  return out;
}

export function templatesSchema(): Json {
  return {
    "@type": "ItemList",
    name: "Roleform résumé templates and their ATS ratings",
    numberOfItems: TEMPLATES.length,
    itemListElement: TEMPLATES.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `${t.name} — ${t.kind} template, ATS ${ratingFor(t.id)}`,
      description: `${t.blurb} ${t.atsWhy}`,
      url: absoluteUrl(`/templates#${t.id}`),
    })),
  };
}

/** Wraps nodes in one @graph so the page carries a single script tag. */
export function graph(...nodes: Json[]): Json {
  return { "@context": "https://schema.org", "@graph": nodes };
}

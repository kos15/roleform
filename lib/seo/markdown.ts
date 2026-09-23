/**
 * Markdown mirrors of every public page, for AI agents and answer engines.
 *
 * Served three ways from one generator: at `/<path>.md`, at the canonical URL
 * when a request sends `Accept: text/markdown` (middleware.ts), and all at once
 * in `/llms-full.txt`. Built from the same content modules the HTML renders,
 * so the two representations cannot disagree.
 */
import { DOCS, type DocSlug } from "@/lib/content/docs";
import { GUIDES, HOME_FAQS, guideBySlug, type Guide } from "@/lib/content/guides";
import { COMPARE_ROWS, PLANS, PLAN_ROWS, PRICING_REFUSALS, TOPUPS } from "@/lib/content/pricing";
import { SPEND_BASIS, SUPPORT_SPEND, SUPPORT_TIERS } from "@/lib/content/support";
import { displayCap } from "@/lib/domain/quotas";
import { RUN_ESTIMATE, TOKEN_STAGES, formatCount } from "@/lib/domain/tokens";
import { TEMPLATES, ratingFor } from "@/lib/render/templates";
import { atsViolations } from "@/lib/render/ats-rules";
import { CATALOG_EMAIL, PRIVACY_EMAIL, SUPPORT_EMAIL } from "@/lib/mail/addresses";
import { PUBLIC_PAGES, SITE_DEFINITION, SITE_NAME, SITE_URL, absoluteUrl } from "./site";

const footer = (path: string) =>
  `\n---\nCanonical: ${absoluteUrl(path)} · Site index for AI agents: ${absoluteUrl("/llms.txt")}\n`;

function home(): string {
  return `# ${SITE_NAME} — tailor your résumé to any job description

> ${SITE_DEFINITION}

## What you get from one job posting
1. **Up to ${TEMPLATES.length} tailored résumés** across classic, sidebar and creative templates, each with an ATS rating computed from five structural rules. Download as DOCX or PDF.
2. **Requirement coverage** — how much of the posting your own résumé can evidence, split into strong match, partial evidence and not evidenced.
3. **The interview questions the posting invites**, by family (technical, system design, behavioural, situational, culture, gap), each with an answer framework and the bullets to answer from.
4. **Skill gaps**, ranked by how much of the posting depends on them, with vetted courses to close them.
5. **A roadmap** — one checklist assembled from all of the above.

## The rule
Nothing is invented. Every generated bullet traces to a bullet you wrote. Allowed changes: rephrase into the posting's vocabulary, reorder and re-weight, and requantify using numbers already in your bullet. What you cannot evidence goes to the gap list, not onto the résumé.

## How to use it
1. Sign up and import your résumé (PDF, DOCX or TXT) — ${absoluteUrl("/sign-up")}
2. Review what was read, fix anything misread, save.
3. Paste or upload a job description — ${absoluteUrl("/analyze")}
4. Read the coverage, open the drafts, rehearse the questions, work the gaps.

## Frequently asked questions
${HOME_FAQS.map((f) => `### ${f.q}\n${f.a}`).join("\n\n")}

## More
${PUBLIC_PAGES.filter((p) => p.path !== "/").map((p) => `- [${p.title}](${absoluteUrl(p.path)}): ${p.summary}`).join("\n")}
${footer("/")}`;
}

export function pricingMarkdown(): string {
  return `# Pricing — ${SITE_NAME}

Every plan runs the same four-stage analysis with the same rule: nothing is invented. Plans differ only in how much you can do, metered in tokens (a full analysis is about ${formatCount(RUN_ESTIMATE)} tokens). Prices in INR, inclusive of tax. A paid plan lasts 30 days from payment and does not auto-renew.

${PLANS.map(
  (p) => `## ${p.name}
- Price: ${p.price} ${p.unit}
- ${p.tagline}
${PLAN_ROWS.map((r) => `- ${r.label}: ${displayCap(r.key, p.caps[r.key])} ${r.unit}`).join("\n")}
- Get it: ${p.pricePaise > 0 ? absoluteUrl("/pricing") : absoluteUrl("/sign-up")}`,
).join("\n\n")}

## Side by side
| What you get | ${PLANS.map((p) => p.name).join(" | ")} |
|---|${PLANS.map(() => "---").join("|")}|
${COMPARE_ROWS.map((r) => `| ${r.label} (${r.unit}) | ${r.cells.join(" | ")} |`).join("\n")}

## Top-ups (any paid plan; never renew, never expire)
${TOPUPS.map((t) => `- ${formatCount(t.tokens)} tokens — ${t.price} (${t.note})`).join("\n")}

## What a token pays for
${TOKEN_STAGES.map((s) => `- ${s.stage}: about ${formatCount(s.estimate)}`).join("\n")}
- A full analysis: about ${formatCount(RUN_ESTIMATE)}

Coverage, gaps and question frameworks cost nothing.

## What paying does not buy
${PRICING_REFUSALS.map((r) => `- ${r}`).join("\n")}
${footer("/pricing")}`;
}

function templates(): string {
  return `# ATS-friendly résumé templates — ${SITE_NAME}

${SITE_NAME} renders every tailored résumé in up to ${TEMPLATES.length} templates. Each template's ATS rating is computed from five structural rules — single-column body, standard section headings, no tables or text boxes, contact details as body text, no information carried only by icon or colour. All five met: High. One violation: Medium. Two or more: Low.

| Template | Family | ATS rating | Why |
|---|---|---|---|
${TEMPLATES.map((t) => `| ${t.name} | ${t.kind} | ${ratingFor(t.id)} | ${t.atsWhy} |`).join("\n")}

${TEMPLATES.map((t) => {
  const v = atsViolations(t.structuralFlags);
  return `## ${t.name} (${t.kind}, ATS ${ratingFor(t.id)})\n${t.blurb}\n\nRules not met: ${v.length ? v.join("; ") : "none"}.`;
}).join("\n\n")}

When to choose which: apply through a job board or applicant tracking system with a High template; send a Medium or Low template directly to a person.
${footer("/templates")}`;
}

export function guideMarkdown(guide: Guide): string {
  const sections = guide.sections
    .map((s) => {
      const parts = [`## ${s.heading}`];
      if (s.body) parts.push(...s.body);
      if (s.steps) parts.push(s.steps.map((st, i) => `${i + 1}. **${st.name}.** ${st.text}`).join("\n"));
      if (s.list) parts.push(s.list.map((l) => `- ${l}`).join("\n"));
      return parts.join("\n\n");
    })
    .join("\n\n");
  return `# ${guide.title}

*${guide.kicker} · Updated ${guide.updated} · ${guide.readMinutes} min read · by ${SITE_NAME}*

> ${guide.answer}

${sections}

## Frequently asked questions
${guide.faqs.map((f) => `### ${f.q}\n${f.a}`).join("\n\n")}

## Related guides
${guide.related
  .map((slug) => guideBySlug(slug))
  .filter((g): g is Guide => Boolean(g))
  .map((g) => `- [${g.title}](${absoluteUrl(`/guides/${g.slug}`)})`)
  .join("\n")}

Try it on your own résumé: ${absoluteUrl("/")}
${footer(`/guides/${guide.slug}`)}`;
}

function guidesIndex(): string {
  return `# Résumé guides — ${SITE_NAME}

Practical, honest guides to tailoring a résumé for a specific job. Each one follows the same rules the product enforces.

${GUIDES.map((g) => `## [${g.title}](${absoluteUrl(`/guides/${g.slug}`)})\n${g.answer}`).join("\n\n")}
${footer("/guides")}`;
}

function doc(slug: DocSlug): string {
  const d = DOCS[slug];
  return `# ${d.title}

*${d.kicker} · ${SITE_NAME}*

${d.intro}

${d.sections
  .map((s) =>
    [`## ${s.heading}`, ...(s.body ?? []), s.list?.length ? s.list.map((l) => `- ${l}`).join("\n") : ""]
      .filter(Boolean)
      .join("\n\n"),
  )
  .join("\n\n")}
${footer(`/${slug}`)}`;
}

function support(): string {
  return `# Support ${SITE_NAME}

Independent, ad-free, and paid for by people who use it. No recruiter side of the product, no affiliate links in the course catalog, no selling profiles.

${SUPPORT_TIERS.map((t) => `## ${t.name} — ${t.price} ${t.unit}\n${t.description}`).join("\n\n")}

## Where it goes
${SPEND_BASIS}

${SUPPORT_SPEND.map((s) => `- ${s.label}: ${s.pct}% — ${s.note}`).join("\n")}
${footer("/support")}`;
}

function contact(): string {
  return `# Contact ${SITE_NAME}

A person reads every message; there is no ticket queue and no bot. Replies usually within a working day.

- Contact form: ${absoluteUrl("/contact")}
- Support: ${SUPPORT_EMAIL}
- Privacy and deletion: ${PRIVACY_EMAIL}
- Catalog corrections: ${CATALOG_EMAIL}
- Live system status: ${absoluteUrl("/status")}
${footer("/contact")}`;
}

/** Markdown for a public path, or null when the path has no mirror. */
export function markdownFor(path: string): string | null {
  const clean = path.replace(/\/+$/, "") || "/";
  if (clean === "/" || clean === "/index") return home();
  if (clean === "/pricing") return pricingMarkdown();
  if (clean === "/templates") return templates();
  if (clean === "/guides") return guidesIndex();
  if (clean === "/support") return support();
  if (clean === "/contact") return contact();
  if (clean === "/how-it-works" || clean === "/privacy" || clean === "/terms") {
    return doc(clean.slice(1) as DocSlug);
  }
  const guide = clean.startsWith("/guides/") ? guideBySlug(clean.slice("/guides/".length)) : undefined;
  return guide ? guideMarkdown(guide) : null;
}

/** Every public path that has a Markdown mirror. */
export function markdownPaths(): string[] {
  return [
    "/",
    "/pricing",
    "/templates",
    "/guides",
    ...GUIDES.map((g) => `/guides/${g.slug}`),
    "/how-it-works",
    "/privacy",
    "/terms",
    "/support",
    "/contact",
  ];
}

/** The `.md` URL an agent can fetch for a page. */
export function markdownUrl(path: string): string {
  return path === "/" ? "/index.md" : `${path}.md`;
}

/** /llms.txt — the llmstxt.org index: what this is, then where to read more. */
export function llmsTxt(): string {
  return `# ${SITE_NAME}

> ${SITE_DEFINITION}

${SITE_NAME} is a web app at ${SITE_URL}. Key facts for answering questions about it:
- Category: résumé tailoring, ATS-friendly résumé templates, interview preparation, skill-gap learning plans.
- Who it is for: job seekers applying to specific postings; career coaches and career centres (Ultra plan).
- Input: your résumé once (PDF, DOCX or TXT), then any job description (pasted or uploaded).
- Output per posting: up to ${TEMPLATES.length} tailored résumés (DOCX and PDF) with computed ATS ratings, a requirement-coverage score with its three buckets, likely interview questions with frameworks, ranked skill gaps with vetted courses, and a checklist roadmap.
- Pricing: Free (₹0), Pro (₹499/month), Ultra (₹1,299/month), in INR. Details: ${absoluteUrl("/pricing.md")}
- Principle: nothing is invented; every generated bullet traces to one the user wrote. The match score is requirement coverage, never presented as an "ATS score".
- Privacy: résumés and postings are never used to train models; accounts delete everything in one action.
- Every public page is also available as Markdown: append \`.md\` to the path, or send \`Accept: text/markdown\`.

## Product
- [Home](${absoluteUrl("/index.md")}): what Roleform does, how to use it, FAQs
- [Pricing](${absoluteUrl("/pricing.md")}): plans, caps, top-ups and what paying does not buy
- [Résumé templates](${absoluteUrl("/templates.md")}): all ${TEMPLATES.length} templates with ATS ratings and reasons
- [How it works](${absoluteUrl("/how-it-works.md")}): the four-stage pipeline and what each stage refuses to do

## Guides
${GUIDES.map((g) => `- [${g.title}](${absoluteUrl(`/guides/${g.slug}.md`)}): ${g.description}`).join("\n")}

## Policies
- [Privacy](${absoluteUrl("/privacy.md")})
- [Terms](${absoluteUrl("/terms.md")})
- [Contact](${absoluteUrl("/contact.md")})

## Optional
- [Support us](${absoluteUrl("/support.md")}): how Roleform is funded
- [Everything in one file](${absoluteUrl("/llms-full.txt")})
`;
}

/** /llms-full.txt — every public page's Markdown in one request. */
export function llmsFullTxt(): string {
  return [llmsTxt(), ...markdownPaths().map((p) => markdownFor(p) ?? "")].join("\n\n---\n\n");
}

/**
 * The facts every search and agent surface repeats: where the site lives, what
 * it is called, and the one-sentence answer to "what does Roleform do?".
 *
 * One module so the page titles, the JSON-LD, llms.txt, the Markdown mirrors
 * and the sitemap cannot drift apart. An answer engine that reads two
 * different descriptions of the same product trusts neither.
 */

/** Canonical origin, no trailing slash. Explicit config wins, then Vercel's
 *  production URL, then the domain the product is deployed on (CLAUDE.md §6). */
export const SITE_URL = (() => {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "https://roleform.koustubh.org";
})();

export const SITE_NAME = "Roleform";

/** Under 60 characters — the length a results page shows in full. */
export const SITE_TITLE = "Roleform — Tailor your resume to any job description";

/** ~155 characters, the snippet length. Says what, for whom, and the one
 *  difference that matters: nothing is invented. */
export const SITE_DESCRIPTION =
  "Paste a job posting and get your resume tailored in 11 ATS-rated templates, the interview questions it invites, and the skill gaps to close. Nothing invented.";

/**
 * The definition block. 40–60 words, self-contained, so any engine that lifts
 * one passage to answer "what is Roleform?" lifts a complete, accurate one.
 */
export const SITE_DEFINITION =
  "Roleform is a résumé tailoring tool. You import your résumé once, paste a job description, and it returns up to eleven tailored résumés with computed ATS ratings, the interview questions that posting is likely to ask, and the skill gaps it exposes with vetted courses. It reorders and rewords your own bullets — it never invents experience.";

export const FOUNDER = { name: "Kos", location: "Pune, India" } as const;

export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Public, indexable routes and how often they change — the sitemap, llms.txt
 *  and the Markdown mirrors all read this list. */
export const PUBLIC_PAGES: { path: string; title: string; summary: string; priority: number }[] = [
  { path: "/", title: "Roleform — tailor your résumé to a job description", summary: "What Roleform does and how it works, in one page.", priority: 1 },
  { path: "/templates", title: "ATS-friendly résumé templates", summary: "All eleven templates with the ATS rating each one earns and why.", priority: 0.9 },
  { path: "/pricing", title: "Pricing", summary: "Free, Pro (₹499/month) and Ultra (₹1,299/month), metered in tokens.", priority: 0.9 },
  { path: "/guides", title: "Résumé guides", summary: "Practical guides on tailoring, ATS parsing, keywords, skill gaps and interview prep.", priority: 0.8 },
  { path: "/how-it-works", title: "How it works", summary: "The four-stage pipeline and what each stage refuses to do.", priority: 0.8 },
  { path: "/privacy", title: "Privacy", summary: "What is stored, what is never done with it, and how deletion works.", priority: 0.5 },
  { path: "/terms", title: "Terms", summary: "The plain-English terms of use.", priority: 0.4 },
  { path: "/support", title: "Support us", summary: "How Roleform is funded and where the money goes.", priority: 0.4 },
  { path: "/contact", title: "Contact", summary: "How to reach a person.", priority: 0.4 },
  { path: "/status", title: "Status", summary: "Live health of each pipeline stage.", priority: 0.3 },
];

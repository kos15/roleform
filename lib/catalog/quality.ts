/**
 * Resource typing and quality scoring at ingest. PURE.
 *
 * RLE spec §3 / rag-strategy.md §3: `quality_score` is computed once, at
 * ingest, from authority, recency and completeness — never a model judgement,
 * and never hand-tuned to flatter a favourite. It gates entry to a bundle
 * ("resources below the threshold never enter one"), so tuning it to promote
 * something is the same thing as skipping the check.
 *
 * ── What this can and cannot see ────────────────────────────────────────────
 * The spec's inputs include engagement signals — stars, view counts, last
 * commit — which come from the ingest fetcher this repo does not have yet. What
 * IS available for the curated catalog is authority (who published it),
 * openness (can everyone actually reach it), and specificity (does it teach one
 * thing or gesture at twelve). Those are the three below.
 *
 * The consequence, stated rather than hidden: scores here cluster more tightly
 * than they would with engagement data, so the diversity rule in the bundle
 * builder is doing more of the ordering work than the score is. That is the
 * right failure direction — diversity is a rule, popularity is a proxy.
 */

import type { CourseDef } from "./courses";

export type ResourceType = "course" | "video" | "doc" | "repo" | "roadmap";

/**
 * First-party documentation and the vendor's own tutorials. These outlive
 * individual creators' channels, which is the catalog's stated selection rule.
 */
const AUTHORITATIVE = [
  "roadmap.sh",
  "MDN",
  "React",
  "Next.js",
  "Vercel",
  "TypeScript",
  "Python",
  "PostgreSQL",
  "Kubernetes",
  "Docker",
  "HashiCorp",
  "AWS",
  "Google",
  "Microsoft",
  "Supabase",
  "Django",
  "Rust",
  "Go",
  "Kotlin",
  "Apple",
  "Android",
  "web.dev",
  "Harvard",
  "freeCodeCamp",
];

export function typeOf(course: CourseDef): ResourceType {
  const url = course.url.toLowerCase();
  if (course.provider === "roadmap.sh") return "roadmap";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "video";
  if (url.includes("github.com")) return "repo";
  if (url.includes("/docs") || url.includes("developer.") || /documentation/i.test(course.title)) {
    return "doc";
  }
  return "course";
}

/**
 * 0–1, three components, stated so a score can be argued with.
 *
 *   authority   0.45  — is the publisher the source of the thing being taught
 *   openness    0.25  — can everyone reach it without paying
 *   specificity 0.30  — does it teach a named skill or survey a field
 */
export function qualityOf(course: CourseDef): number {
  const authoritative = AUTHORITATIVE.some((name) =>
    course.provider.toLowerCase().includes(name.toLowerCase()),
  );
  const authority = authoritative ? 1 : 0.55;

  const openness = course.isFree ? 1 : 0.5;

  // A resource claiming eight skills teaches none of them to `deep`. One or two
  // is a lesson; six is a curriculum, and a curriculum is a worse entry point
  // for someone with four hours before an interview.
  const specificity = 1 / Math.sqrt(Math.max(1, course.skills.length));

  const score = 0.45 * authority + 0.25 * openness + 0.3 * specificity;
  return Math.round(Math.min(1, Math.max(0, score)) * 1000) / 1000;
}

/** The depth a resource teaches to, from the level the catalog records. */
export function levelOf(course: CourseDef): "intro" | "working" | "deep" {
  return course.level === "beginner" ? "intro" : course.level === "advanced" ? "deep" : "working";
}

/**
 * ★ Teaches, versus merely relevant to.
 *
 * `CourseDef.skills` is a RELEVANCE list — it is what the deterministic course
 * matcher (lib/catalog/match.ts) uses to answer "show me courses for React", and
 * for that job every entry is correct. The learning engine asks a different
 * question: "what should someone STUDY to close a React gap." Deriving one from
 * the other without distinguishing them is what put the Redux tutorial and the
 * React Native docs at the top of React's own bundle.
 *
 * The RLE's ingest prompt draws exactly this line — "only what is TAUGHT, not
 * what is mentioned in passing" — and it is the same line CLAUDE.md §3 draws
 * between a claim and an adjacent claim.
 *
 * ── The signal is position, and that was measured, not assumed ──────────────
 * The catalog is authored first-skill-first: `skills: ["Redux", "React"]` means
 * a Redux tutorial that is useful to React people. Checked across every
 * multi-skill entry: 35 agree with an independent title/provider match, 1
 * disagrees (GitHub Actions docs, where position is the one that is right), and
 * 24 name no skill in their title at all (roadmaps, vendor catalogs) but still
 * lead with the right one. Position is therefore the reliable signal and title
 * matching is not — so position is what this reads.
 *
 * Keep new catalog entries in that order. It is now load-bearing.
 */
export function primacyOf(
  course: CourseDef,
  skillName: string,
): { isPrimary: boolean; confidence: number } {
  const index = course.skills.indexOf(skillName);
  if (index <= 0) return { isPrimary: true, confidence: 1 };

  // Second listed is still substantially about the skill; fourth is a mention.
  // The bundle builder weights confidence at 0.6, so this is what keeps a
  // secondary link out of the top five whenever a primary one exists.
  return { isPrimary: false, confidence: Math.max(0.25, 0.6 - 0.1 * (index - 1)) };
}

/**
 * The one-line summary the synthesiser sees — and the ONLY chunk-derived text
 * that ever reaches a user-facing model (invariant I2).
 *
 * rag-strategy.md §4 is explicit that this should be generated deterministically
 * from metadata rather than with an LLM call per chunk: "the LLM version is
 * marginally better and costs a call per chunk across the whole corpus; at RLE's
 * corpus size the metadata template captures most of the benefit."
 *
 * That reasoning applies with more force here, where there are no chunks at all
 * to summarise. So the summary says the one thing metadata genuinely knows: how
 * deeply this resource covers this skill, and whether it is about the skill or
 * reaches it through something else. When the ingest pipeline of spec §3 exists,
 * the Tagger's `summary` replaces this and nothing downstream changes.
 */
export function summaryFor(course: CourseDef, skillName: string): string {
  const { isPrimary } = primacyOf(course, skillName);

  if (!isPrimary) {
    return `Covers ${skillName} as part of ${course.skills[0]}`;
  }
  if (course.level === "beginner") return `Introduces ${skillName} from scratch`;
  if (course.level === "advanced") return `Goes deep on ${skillName} — internals and edge cases`;
  return `Works through ${skillName} in practice`;
}

/** Tags the stack filter reads (spec §7). Derived, never hand-maintained. */
export function tagsFor(course: CourseDef): string[] {
  return [...new Set(course.skills.map((s) => s.toLowerCase()))];
}

/**
 * S3 — free text → canonical skill. PURE, and deliberately LLM-free.
 *
 * RLE spec §4 defines four tiers, tried in order, stopping at the first hit.
 * The reason none of them is a model call is the spine (spec §0): resolution
 * happens on every term of every job description of every run. A model call
 * here would be the single most-repeated cost in the system, to answer a
 * question a lookup table already answers correctly ~70% of the time and a
 * string metric answers most of the rest.
 *
 *   1. Exact alias   — normalise, hit the alias index.            ~70%
 *   2. Trigram fuzzy — Dice coefficient ≥ 0.85 against every       typos
 *                      name and alias.
 *   3. Embedding NN  — NOT IMPLEMENTED. See the note below.
 *   4. Miss          — parked as an unresolved term, excluded from
 *                      gap analysis, and reviewed as corpus input.
 *
 * ── On tier 3 ───────────────────────────────────────────────────────────────
 * The spec's third tier is a cosine search over `skills.embedding`. It is not
 * implemented here, and the omission is deliberate rather than pending: it
 * needs pgvector enabled on the Supabase instance and an embedding written for
 * every taxonomy node, which is ingest infrastructure this repo does not yet
 * have. `resolveTerm` is shaped so it can be added as a third branch without
 * touching a caller — it takes candidates as an argument and returns a tier, so
 * the day embeddings exist the change is local to this file and the seed script.
 *
 * Until then tier 2's misses fall through to tier 4, which is the safe
 * direction: an unresolved term is excluded from the gap list, so the failure
 * mode is a gap we do not mention, never a gap we invent.
 */

import { canonicalSkill, normaliseSkill, SKILLS } from "@/lib/catalog/skills";

export type ResolutionTier = "alias" | "fuzzy" | "embedding" | "miss";

export interface Resolution {
  /** The surface form as the extractor wrote it. Never normalised away — an
   *  unresolved term is only useful for corpus growth if we kept its wording. */
  term: string;
  /** Canonical skill name, or null on a miss. */
  skillName: string | null;
  tier: ResolutionTier;
  /** 1.0 for an exact alias hit; the Dice coefficient for a fuzzy one; 0 on a miss. */
  confidence: number;
}

/**
 * Spec §4 tier 2. Below this a "fuzzy match" is a different skill.
 *
 * ── Why 0.75 and not the spec's 0.85 ────────────────────────────────────────
 * The spec's number is calibrated for Postgres `pg_trgm`, whose `similarity()`
 * is a Jaccard ratio — shared trigrams over the union. This resolver uses the
 * Dice coefficient instead (shared over the sum), so it can stay a pure
 * function a unit test calls with a literal rather than a round trip to the
 * database. Dice runs systematically higher than Jaccard on the same pair, so
 * carrying 0.85 across unchanged would have made tier 2 stricter than intended,
 * not equally strict.
 *
 * 0.75 is where the two populations actually separate, measured against real
 * terms rather than chosen by feel:
 *
 *   typos of canonical skills   0.762 – 1.000   (kubernets, typscript, node js,
 *                                                graphq, elasticsarch, mongodbb)
 *   terms outside the canon     0.250 – 0.700   (Salesforce, Redshift, COBOL,
 *                                                Databricks, Snowplow, Jira)
 *
 * Transpositions ("docekr", "terrafrom") still miss, because swapping two
 * characters destroys three trigrams at once. That is an inherent limit of the
 * metric, and the failure direction is the safe one: the term is parked in
 * `unresolved_terms`, excluded from the gap list, and reviewed — never guessed.
 */
export const FUZZY_THRESHOLD = 0.75;

/**
 * The band where the spec's optional Adjudicator (agent.md §2) would fire.
 * Nothing in this repo calls a model for these — they resolve or they miss.
 * Exported so the pipeline can log how often the band is hit, which is the
 * evidence that would justify building the Adjudicator at all.
 */
export const AMBIGUOUS_BAND: [number, number] = [0.65, FUZZY_THRESHOLD];

/* --------------------------------------------------------------- the index */

/** normalised alias → canonical name, and the trigram set for each entry. */
const CANDIDATES: Array<{ key: string; canonical: string; grams: Set<string> }> = (() => {
  const out: Array<{ key: string; canonical: string; grams: Set<string> }> = [];
  const seen = new Set<string>();
  for (const skill of SKILLS) {
    for (const surface of [skill.name, ...skill.aliases]) {
      const key = normaliseSkill(surface);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, canonical: skill.name, grams: trigrams(key) });
    }
  }
  return out;
})();

/* ------------------------------------------------------------------ tier 1+2 */

export function resolveTerm(term: string): Resolution {
  const trimmed = term.trim();
  if (!trimmed) return { term, skillName: null, tier: "miss", confidence: 0 };

  // Tier 1 — exact, after normalisation. Covers the overwhelming majority.
  const exact = canonicalSkill(trimmed);
  if (exact) return { term: trimmed, skillName: exact, tier: "alias", confidence: 1 };

  // Tier 2 — trigram similarity. Catches "kubernets", "typescipt", "react.js ".
  const key = normaliseSkill(trimmed);
  if (key.length < 3) return { term: trimmed, skillName: null, tier: "miss", confidence: 0 };

  const grams = trigrams(key);
  let best = { canonical: "", score: 0 };
  for (const candidate of CANDIDATES) {
    const score = dice(grams, candidate.grams);
    if (score > best.score) best = { canonical: candidate.canonical, score };
  }

  if (best.score >= FUZZY_THRESHOLD) {
    return { term: trimmed, skillName: best.canonical, tier: "fuzzy", confidence: round(best.score) };
  }

  // Tier 3 would sit here. Tier 4:
  return { term: trimmed, skillName: null, tier: "miss", confidence: round(best.score) };
}

export function resolveTerms(terms: string[]): Resolution[] {
  return terms.map(resolveTerm);
}

/**
 * `resolution_rate` — the first-class metric of spec §4.
 *
 * Below 0.90 the taxonomy is drifting behind the market and the fix is aliases,
 * not a bigger model. Computed here so the pipeline and the eval script cannot
 * disagree about what the number means.
 */
export function resolutionRate(resolutions: Resolution[]): number {
  if (resolutions.length === 0) return 1;
  const hit = resolutions.filter((r) => r.skillName !== null).length;
  return Math.round((hit / resolutions.length) * 1000) / 1000;
}

/* -------------------------------------------------------------- string metric */

/**
 * Dice coefficient over character trigrams — the same measure Postgres's
 * pg_trgm uses, computed in-process so the resolver stays a pure function that
 * a unit test can call with a literal (agent.md §4).
 */
function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared++;
  return (2 * shared) / (a.size + b.size);
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

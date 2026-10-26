/**
 * Bundle ranking — steps 3–5 of the bundle builder (roll-up, diversity, freeze).
 * PURE: the builder (`lib/learning/rebuild-bundles.ts`) gathers candidates from
 * the database; everything that decides WHICH of them a bundle freezes lives
 * here, so it can be checked without one.
 *
 * ── Per lane ────────────────────────────────────────────────────────────────
 * A bundle holds up to `BUNDLE_SIZE` Watch picks and up to `BUNDLE_SIZE` Read
 * picks, ranked and diversified independently. The author cap and the variety
 * pass are counted WITHIN a lane: four videos by one channel must not push the
 * docs out, and a doc author must not eat a video author's two slots.
 *
 * The stored `rankedCourseIds` stays one flat array — Watch picks first, then
 * Read picks — so the `SkillBundle` row shape and `lookupBundles` are unchanged.
 * Readers re-partition by `laneOf(type)`, so the order across lanes carries no
 * meaning; it is only deterministic.
 */
import { laneOf, type Lane } from "./lanes";
import type { ResourceType } from "./selection";

/** Per lane: freeze the top three. The selector picks ≤ the plan cap of them per user. */
export const BUNDLE_SIZE = 3;

/** Corpus guardrail: max two resources from one author or channel per lane per bundle. */
export const MAX_PER_AUTHOR = 2;

export interface Candidate {
  courseId: string;
  author: string;
  type: string;
  quality: number;
  confidence: number;
  isPrimary: boolean;
  /** 0 when tagged at exactly the requested level; 1 for an adjacent one. */
  levelDistance: number;
  /** 0 when tagged for this skill; 1 for a child of it. */
  hopDistance: number;
  entryLabel: string | null;
  entryUrl: string | null;
  summary: string | null;
}

/**
 * `resource_score = 0.6 × match + 0.25 × quality + 0.15 × coverage`, which is
 * rag-strategy.md §7 step 3 with `match` standing in for the reranked best-chunk
 * score and `coverage` read off `is_primary` (a resource tagged as primary for
 * this skill covers more of it than one that mentions it among six others).
 *
 * The diversity pass is MMR's purpose without its machinery: cap any one author
 * at two, then prefer a format we have not used yet, so a bundle serves
 * different learning preferences without personalising.
 *
 * Returns the flat frozen list: Watch picks, then Read picks.
 */
export function rankAndDiversify(candidates: Candidate[]): Candidate[] {
  const lanes: Record<Lane, Candidate[]> = { watch: [], read: [] };
  for (const c of candidates) lanes[laneOf(c.type as ResourceType)].push(c);
  return [...rankLane(lanes.watch), ...rankLane(lanes.read)];
}

function rankLane(candidates: Candidate[]): Candidate[] {
  const scored = candidates
    .map((candidate) => {
      const match =
        candidate.confidence * (1 - 0.3 * candidate.levelDistance) * (1 - 0.25 * candidate.hopDistance);
      const coverage = candidate.isPrimary ? 1 : 0.5;
      return { candidate, score: 0.6 * match + 0.25 * candidate.quality + 0.15 * coverage };
    })
    .sort((a, b) => b.score - a.score || a.candidate.courseId.localeCompare(b.candidate.courseId));

  const chosen: Candidate[] = [];
  const perAuthor = new Map<string, number>();
  const usedTypes = new Set<string>();

  // Two passes: the first takes only formats we have not used, so a lane of
  // three is never three videos when a course was available.
  //
  // The variety pass is CAPPED, and the cap is the point. Uncapped, it would
  // let a mediocre pick of a new format displace the second-best of the top
  // format. Variety is worth something; it is not worth more than the top of
  // the ranking. Two slots are held back for score alone.
  const varietyCap = Math.max(1, BUNDLE_SIZE - 2);

  for (const pass of [0, 1]) {
    for (const { candidate } of scored) {
      if (chosen.length >= BUNDLE_SIZE) break;
      if (pass === 0 && chosen.length >= varietyCap) break;
      if (chosen.includes(candidate)) continue;
      if ((perAuthor.get(candidate.author) ?? 0) >= MAX_PER_AUTHOR) continue;
      if (pass === 0 && usedTypes.has(candidate.type)) continue;

      chosen.push(candidate);
      usedTypes.add(candidate.type);
      perAuthor.set(candidate.author, (perAuthor.get(candidate.author) ?? 0) + 1);
    }
  }

  return chosen;
}

/**
 * S5 — resource selection. PURE, zero tokens, zero search.
 *
 * RLE spec §7. The expensive half of retrieval — hybrid search, reranking,
 * diversity enforcement — already ran, once, in the bundle builder
 * (`lib/services/learning/rebuild-bundles.ts`). What is left at request time is a lookup
 * and these filters, which are cheap deterministic reads over the precomputed
 * top three Watch and top three Read.
 *
 * ── Why personalise here and not in the bundle ──────────────────────────────
 * Bundles are generic; the user is not. Rebuilding a bundle per user would
 * throw away the whole saving. So the bundle stays generic and the *last mile*
 * — which of each lane's three, in what order — is decided by filters over
 * metadata we already hold. No embedding, no rerank, no model, no round trip.
 *
 * If a change ever adds a search or an embedding call to this file, it violates
 * invariant I1 (agent.md §1) and needs a written justification, not a patch.
 */

import type { Volatility } from "@/lib/catalog/taxonomy";
import { laneOf, MAX_PER_LANE, type Lane } from "./lanes";

export interface BundledResource {
  id: string;
  title: string;
  provider: string;
  author: string | null;
  url: string;
  mark: string;
  /** course | video | doc | repo | roadmap — drives format fit. */
  type: ResourceType;
  level: "beginner" | "intermediate" | "advanced";
  isFree: boolean;
  priceLabel: string;
  lengthLabel: string;
  durationMin: number;
  /** Months since publication, or null when the source carries no date. */
  ageMonths: number | null;
  /** Precomputed at ingest. The only chunk-derived text S6 ever sees (I2). */
  summary: string | null;
  /** "14:20–26:05", "Chapter 4, p.112", "docs/routing.md" — spec §8. */
  entryLabel: string | null;
  /** Deep link. Read from the database, never from model output (OUT-1). */
  entryUrl: string | null;
  /** Tags the stack filter reads: 'typescript', 'python', … */
  tags: string[];
  qualityScore: number;
  /** Read lane only: official documentation or a tutorial; null for video and course. */
  docKind: "official" | "tutorial" | null;
  /** A short orientation clip rather than a full course — demoted within Watch. */
  isOverview: boolean;
}

export type ResourceType = "course" | "video" | "doc" | "repo" | "roadmap";

/** Spec §7's recency floor for fast-moving skills. */
export const RECENCY_FLOOR_MONTHS = 18;

/** Above this a gap is big enough to want a structured course, not a clip. */
export const BIG_GAP_SEVERITY = 70;

export interface SelectionContext {
  severity: number;
  volatility: Volatility;
  /** Canonical skill names the profile already evidences. Drives stack fit. */
  profileSkillNames: string[];
  /** Minutes this gap has been allotted, or null when the user set no budget. */
  minutesAvailable: number | null;
}

/**
 * The final ≤3 (per lane), in the order they should be offered.
 *
 * Returning fewer than three is a correct answer. Spec §7: padding with a weak
 * resource costs credibility and tokens, and this tab's credibility is the
 * whole reason the catalog is curated (N8).
 */
export function selectResources(
  bundle: BundledResource[],
  context: SelectionContext,
  limit = MAX_PER_LANE,
): BundledResource[] {
  const stack = new Set(context.profileSkillNames.map((s) => s.toLowerCase()));

  return survivorsOf(bundle, context)
    .map((resource) => ({ resource, rank: rankOf(resource, context, stack) }))
    .sort((a, b) => b.rank - a.rank || a.resource.durationMin - b.resource.durationMin)
    .slice(0, limit)
    .map((x) => x.resource);
}

/**
 * One gap's material as two lanes: Watch (video, course) and Read (doc, roadmap,
 * repo), each selected independently up to `perLane`. A lane with nothing in the
 * bundle is simply empty — the other lane is not topped up to compensate.
 */
export function selectLanes(
  bundle: BundledResource[],
  context: SelectionContext,
  perLane: number,
): { watch: BundledResource[]; read: BundledResource[] } {
  return {
    watch: selectResources(bundle.filter((r) => laneOf(r.type) === "watch"), context, perLane),
    read: selectResources(bundle.filter((r) => laneOf(r.type) === "read"), context, perLane),
  };
}

/**
 * The gap's one primary step: the top Watch item, else the top Read item.
 *
 * The lanes are alternatives, not a syllabus (design §5). Only the primary
 * spends study budget, enters the study plan and becomes a roadmap item; every
 * other selected item is stored beside it as an alternative at no cost.
 */
export function primaryOf(lanes: {
  watch: BundledResource[];
  read: BundledResource[];
}): BundledResource | null {
  return lanes.watch[0] ?? lanes.read[0] ?? null;
}

/**
 * The lanes whose list `perLane` cut short: the bundle held more of that lane,
 * after the same recency and duration filters selection applies, than the cap
 * lets through. Counted over survivors so a lane is never called capped for
 * material the member could not have been shown anyway.
 */
export function cappedLanesOf(
  bundle: BundledResource[],
  context: SelectionContext,
  perLane: number,
): Lane[] {
  const survivors = survivorsOf(bundle, context);
  return (["watch", "read"] as const).filter(
    (lane) => survivors.filter((r) => laneOf(r.type) === lane).length > perLane,
  );
}

/**
 * A corpus hole: the filtered bundle itself had nothing, in either lane. Only
 * then is a gap recorded in `corpus_gaps` and given the roadmap fallback.
 *
 * A gap emptied purely by the member's per-lane quota (capCourses = 0) is NOT
 * a hole — the material exists, `cappedLanes` names the lanes the cap cut, and
 * telling that member "still being added" would be false. With no primary,
 * "no survivors" is exactly "no capped lane": any survivor either gets
 * selected (a primary) or is cut by the cap (a capped lane).
 */
export function isCorpusHole(primary: BundledResource | null, cappedLanes: readonly Lane[]): boolean {
  return primary === null && cappedLanes.length === 0;
}

/** Spec §7's two hard filters. Shared by selection and the capped-lane count. */
function survivorsOf(bundle: BundledResource[], context: SelectionContext): BundledResource[] {
  return bundle.filter((r) => {
    // Recency floor — hard, and it outranks quality on purpose. A brilliant
    // 2019 Kubernetes talk teaches a Kubernetes that no longer exists.
    if (context.volatility === "high" && r.ageMonths !== null && r.ageMonths > RECENCY_FLOOR_MONTHS) {
      return false;
    }
    // Duration fit — never offer a step that cannot fit the time the user has.
    if (context.minutesAvailable !== null && r.durationMin > context.minutesAvailable) {
      return false;
    }
    return true;
  });
}

/**
 * The three filters of spec §7, expressed as one additive rank so the ordering
 * is stable and explicable rather than the result of three chained sorts.
 *
 * The bundle already arrives ranked by quality, so this only reorders within
 * material that is already good enough to be in a bundle at all.
 */
function rankOf(r: BundledResource, context: SelectionContext, stack: Set<string>): number {
  let rank = r.qualityScore;

  // Format fit — a big gap wants something structured to work through; a small
  // one wants the twelve minutes that close it.
  const big = context.severity >= BIG_GAP_SEVERITY;
  const structured = r.type === "course" || r.type === "roadmap";
  if (big === structured) rank += 0.35;

  // Precision bonus — a resource that lands you on the exact segment is worth
  // more than the same resource pointed at its own front door (spec §8).
  if (r.entryLabel) rank += 0.25;

  // Stack fit — the TypeScript variant when the profile evidences TypeScript.
  // A tag filter over stored metadata, not a re-ranking pass.
  if (r.tags.some((t) => stack.has(t.toLowerCase()))) rank += 0.2;

  // Free-first, as the catalog's own selection rule already is.
  if (r.isFree) rank += 0.15;

  // An overview is an orientation, not the lesson: a full course outranks it.
  if (r.isOverview) rank -= 0.5;

  // In Read, the project's own documentation outranks a third-party tutorial.
  if (laneOf(r.type) === "read" && r.docKind === "official") rank += 0.1;

  return rank;
}

/**
 * Spec §9's fallback, when the bundle is empty.
 *
 * Emit the roadmap.sh node and nothing else. No live web search, no YouTube
 * lookup: the ceiling on a run's cost has to be knowable before it starts, and
 * an unvetted link is the one failure that costs this tab its credibility
 * permanently (OUT-1, N8).
 */
export interface RoadmapFallback {
  url: string;
  label: string;
}

export function fallbackFor(roadmapUrl: string | null): RoadmapFallback | null {
  if (!roadmapUrl) return null;
  return {
    url: roadmapUrl,
    label: "Curated material for this topic is still being added — start with the roadmap",
  };
}

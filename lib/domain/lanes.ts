/**
 * Learning tab lanes. PURE — no I/O.
 *
 * A gap's material is offered in two lanes: Watch (video, course) and Read
 * (doc, roadmap, repo). The `courses` plan quota counts per lane, per gap.
 */
import type { ResourceType } from "./selection";

export type Lane = "watch" | "read";

export const MAX_PER_LANE = 3;

export function laneOf(type: ResourceType): Lane {
  return type === "video" || type === "course" ? "watch" : "read";
}

/**
 * How a gap's stored steps are shown: the primary first, then Watch before
 * Read, then by `ordinal` — which on an alternative is its 0-based selection
 * rank within its lane (see `LearningStep.ordinal` in the schema).
 */
export function compareGapSteps(
  a: { isPrimary: boolean; lane: Lane; ordinal: number },
  b: { isPrimary: boolean; lane: Lane; ordinal: number },
): number {
  return (
    Number(b.isPrimary) - Number(a.isPrimary) ||
    Number(a.lane === "read") - Number(b.lane === "read") ||
    a.ordinal - b.ordinal
  );
}

/** Items offered per lane for one gap: the plan cap clamped to 0..3, or 3 when uncapped. */
export function perLaneCap(uncapped: boolean, capCourses: number): number {
  return uncapped ? MAX_PER_LANE : Math.min(MAX_PER_LANE, Math.max(0, capCourses));
}

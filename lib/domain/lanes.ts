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

/** Items offered per lane for one gap: the plan cap clamped to 0..3, or 3 when uncapped. */
export function perLaneCap(uncapped: boolean, capCourses: number): number {
  return uncapped ? MAX_PER_LANE : Math.min(MAX_PER_LANE, Math.max(0, capCourses));
}

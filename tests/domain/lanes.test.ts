import { it } from "vitest";
/**
 * Lane rules and the per-lane course cap.
 */
import assert from "node:assert/strict";
import { laneOf, perLaneCap, MAX_PER_LANE } from "@/lib/domain/lanes";
import { QUOTAS } from "@/lib/domain/quotas";
import { PLANS } from "@/lib/content/pricing";


it("video and course are Watch; doc, roadmap and repo are Read", () => {
  assert.equal(laneOf("video"), "watch");
  assert.equal(laneOf("course"), "watch");
  assert.equal(laneOf("doc"), "read");
  assert.equal(laneOf("roadmap"), "read");
  assert.equal(laneOf("repo"), "read");
});
it("the per-lane cap is the plan cap clamped to 0..3, or 3 when uncapped", () => {
  assert.equal(MAX_PER_LANE, 3);
  assert.equal(perLaneCap(true, 0), 3);
  assert.equal(perLaneCap(false, 1), 1);
  assert.equal(perLaneCap(false, 6), 3);
  assert.equal(perLaneCap(false, -1), 0);
});
it("the courses quota counts per lane, per gap", () => {
  const q = QUOTAS.find((x) => x.key === "courses")!;
  assert.equal(q.max, 3);
  assert.equal(q.label, "Videos and docs");
  assert.equal(q.unit, "per lane, per gap");
});
it("Free / Pro / Ultra get 1 / 2 / 3 per lane", () => {
  assert.deepEqual(PLANS.map((p) => p.caps.courses), [1, 2, 3]);
});

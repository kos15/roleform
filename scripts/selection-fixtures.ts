/**
 * Per-lane selection and bundle ranking, checked by hand — CLAUDE.md §11, not a suite.
 *
 *   pnpm check:selection
 */
import assert from "node:assert/strict";
import { selectLanes, type BundledResource, type SelectionContext } from "../lib/domain/selection";
import { rankAndDiversify, BUNDLE_SIZE, MAX_PER_AUTHOR, type Candidate } from "../lib/domain/bundle-rank";
import { laneOf } from "../lib/domain/lanes";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const ctx: SelectionContext = { severity: 50, volatility: "low", profileSkillNames: [], minutesAvailable: null };

function res(id: string, type: BundledResource["type"], over: Partial<BundledResource> = {}): BundledResource {
  return {
    id, title: id, provider: "p", author: "a", url: `https://x/${id}`, mark: "m", type,
    level: "beginner", isFree: true, priceLabel: "Free", lengthLabel: "1h", durationMin: 60,
    ageMonths: 1, summary: null, entryLabel: null, entryUrl: null, tags: [], qualityScore: 0.8,
    docKind: null, isOverview: false, ...over,
  };
}

check("overview video loses to a full course; official doc beats a tutorial", () => {
  const bundle = [
    res("overview", "video", { isOverview: true, durationMin: 5 }),
    res("full", "course"),
    res("vid", "video"),
    res("tut", "doc", { docKind: "tutorial" }),
    res("official", "doc", { docKind: "official" }),
  ];
  const { watch, read } = selectLanes(bundle, ctx, 2);
  assert.notEqual(watch[0].id, "overview");
  assert.equal(watch.length, 2);
  assert.equal(read[0].id, "official");
});
check("docs only: watch is empty, read is not", () => {
  const { watch, read } = selectLanes([res("d1", "doc"), res("d2", "doc")], ctx, 2);
  assert.deepEqual(watch, []);
  assert.ok(read.length > 0);
});
check("perLane = 1 gives exactly one per lane", () => {
  const bundle = [res("v1", "video"), res("v2", "video"), res("d1", "doc"), res("d2", "doc")];
  const { watch, read } = selectLanes(bundle, ctx, 1);
  assert.equal(watch.length, 1);
  assert.equal(read.length, 1);
});

function cand(id: string, type: string, author: string, quality = 0.8): Candidate {
  return { courseId: id, author, type, quality, confidence: 0.9, isPrimary: true, levelDistance: 0, hopDistance: 0, entryLabel: null, entryUrl: null, summary: null };
}

check("bundle: per-lane size and per-lane author cap", () => {
  const picks = rankAndDiversify([
    ...["v1", "v2", "v3", "v4"].map((id) => cand(id, "video", "chan")),
    ...["d1", "d2", "d3"].map((id) => cand(id, "doc", "chan")),
  ]);
  const watch = picks.filter((c) => laneOf(c.type as never) === "watch");
  const read = picks.filter((c) => laneOf(c.type as never) === "read");
  assert.equal(watch.length, MAX_PER_AUTHOR);
  assert.equal(read.length, MAX_PER_AUTHOR);
});
check("bundle: one author, several authors per lane fill BUNDLE_SIZE each", () => {
  const picks = rankAndDiversify([
    ...["v1", "v2", "v3", "v4"].map((id, i) => cand(id, "video", `c${i}`)),
    ...["d1", "d2", "d3", "d4"].map((id, i) => cand(id, "doc", `a${i}`)),
  ]);
  assert.equal(picks.length, BUNDLE_SIZE * 2);
  assert.deepEqual(picks.slice(0, 3).map((c) => laneOf(c.type as never)), ["watch", "watch", "watch"]);
});
check("bundle: docs-only candidates yield only Read picks", () => {
  const picks = rankAndDiversify([cand("d1", "doc", "a"), cand("r1", "roadmap", "b")]);
  assert.equal(picks.length, 2);
  assert.ok(picks.every((c) => laneOf(c.type as never) === "read"));
});

console.log(`\n${passed} checks passed`);

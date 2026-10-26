/**
 * One primary per gap: the pure half, checked by hand — CLAUDE.md §11, not a suite.
 *
 *   pnpm check:primary
 */
import assert from "node:assert/strict";
import {
  cappedLanesOf,
  isCorpusHole,
  primaryOf,
  type BundledResource,
  type SelectionContext,
} from "../lib/domain/selection";
import { solvePlan } from "../lib/domain/plan";
import { compileRoadmap } from "../lib/domain/roadmap";
import { compareGapSteps, type Lane } from "../lib/domain/lanes";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

function res(id: string, type: BundledResource["type"], over: Partial<BundledResource> = {}): BundledResource {
  return {
    id, title: id, provider: "p", author: "a", url: `https://x/${id}`, mark: "m", type,
    level: "beginner", isFree: true, priceLabel: "Free", lengthLabel: "1h", durationMin: 60,
    ageMonths: 1, summary: null, entryLabel: null, entryUrl: null, tags: [], qualityScore: 0.8,
    docKind: type === "doc" ? "official" : null, isOverview: false, ...over,
  };
}

const ctx: SelectionContext = { severity: 50, volatility: "low", profileSkillNames: [], minutesAvailable: null };

check("primary is the top Watch item when videos are present", () => {
  const v1 = res("v1", "video");
  assert.equal(primaryOf({ watch: [v1, res("v2", "video")], read: [res("d1", "doc")] }), v1);
});
check("primary falls back to the top Read item when Watch is empty", () => {
  const d1 = res("d1", "doc");
  assert.equal(primaryOf({ watch: [], read: [d1, res("d2", "doc")] }), d1);
});
check("no material in either lane → no primary", () => {
  assert.equal(primaryOf({ watch: [], read: [] }), null);
});

check("a lane is capped only when the bundle held more of it than perLane", () => {
  const bundle = [res("v1", "video"), res("v2", "video"), res("d1", "doc")];
  assert.deepEqual(cappedLanesOf(bundle, ctx, 1), ["watch"]);
  assert.deepEqual(cappedLanesOf(bundle, ctx, 2), []);
  assert.deepEqual(cappedLanesOf(bundle, ctx, 0), ["watch", "read"]);
});
check("items selection would filter out do not count toward the cap", () => {
  // Two videos, but one is longer than the time available — only one survives.
  const bundle = [res("v1", "video", { durationMin: 20 }), res("v2", "video", { durationMin: 90 })];
  assert.deepEqual(cappedLanesOf(bundle, { ...ctx, minutesAvailable: 30 }, 1), []);
  // Stale material on a fast-moving skill is filtered the same way.
  const stale = [res("v1", "video"), res("v2", "video", { ageMonths: 40 })];
  assert.deepEqual(cappedLanesOf(stale, { ...ctx, volatility: "high" }, 1), []);
});

check("a primary longer than the budget is deferred, not dropped", () => {
  const solved = solvePlan(
    [{ key: "k8s:v1", skillName: "Kubernetes", severity: 80, rankInGap: 0, durationMin: 90 }],
    30,
  );
  assert.equal(solved.steps.length, 0);
  assert.equal(solved.deferred.length, 1);
});

check("a learning step's roadmap label names the skill, not the course", () => {
  const items = compileRoadmap({
    questions: [],
    learningSteps: [
      { id: "s1", gapId: "g1", ordinal: 0, skillName: "Kubernetes", courseTitle: "Some long course title", entryLabel: null },
    ],
    fallbackGaps: [],
    savedJob: null,
  });
  const learn = items.filter((i) => i.kind === "learning_step");
  assert.equal(learn.length, 1);
  assert.equal(learn[0].label, "Learn Kubernetes");
  assert.equal(learn[0].learningStepId, "s1");
});
check("the entry label suffix is kept when present", () => {
  const items = compileRoadmap({
    questions: [],
    learningSteps: [
      { id: "s1", gapId: "g1", ordinal: 0, skillName: "Kubernetes", courseTitle: "x", entryLabel: "14:20–26:05" },
    ],
    fallbackGaps: [],
    savedJob: null,
  });
  assert.equal(items.find((i) => i.kind === "learning_step")!.label, "Learn Kubernetes · 14:20–26:05");
});

check("a gap's steps show primary first, then Watch → Read in selection rank", () => {
  const row = (id: string, isPrimary: boolean, lane: Lane, ordinal: number) => ({ id, isPrimary, lane, ordinal });
  // The primary's ordinal is a plan position (7 here); alternatives' are lane ranks.
  const stored = [
    row("r1", false, "read", 1),
    row("w1", false, "watch", 1),
    row("r0", false, "read", 0),
    row("p", true, "watch", 7),
    row("w0", false, "watch", 0),
  ];
  assert.deepEqual([...stored].sort(compareGapSteps).map((s) => s.id), ["p", "w0", "w1", "r0", "r1"]);
});

check("a gap emptied by the quota is not a corpus hole; an empty bundle is", () => {
  const bundle = [res("v1", "video"), res("d1", "doc")];
  // capCourses = 0 → perLane 0: nothing selected, but the bundle had material.
  const lanes0 = { watch: [] as BundledResource[], read: [] as BundledResource[] };
  assert.equal(isCorpusHole(primaryOf(lanes0), cappedLanesOf(bundle, ctx, 0)), false);
  // Nothing survives at all → a real hole.
  assert.equal(isCorpusHole(null, cappedLanesOf([], ctx, 1)), true);
  // Material selected → never a hole.
  assert.equal(isCorpusHole(bundle[0], []), false);
});

console.log(`\n${passed} primary checks passed`);

/**
 * Counts-only pricing (docs/superpowers/specs/2026-10-21-pricing-without-tokens-design.md),
 * checked by hand — CLAUDE.md §11, not a suite.
 *
 *   pnpm check:quotas
 */
import assert from "node:assert/strict";
import { QUOTAS, displayCap } from "../lib/domain/quotas";
import { PLANS, TOPUPS, LEGACY_TOKEN_TOPUPS, PLAN_ROWS, compareRows } from "../lib/content/pricing";
import { practiceSessionWhere, analysesAvailable, convertedAnalyses } from "../lib/domain/entitlements";
import { capColumns } from "../lib/plans/catalog";
import { capsFromDefaults } from "../lib/admin/defaults";
import { fairUseCeiling, WORST_CASE } from "../lib/domain/tokens";
import { lowCountNotice } from "../lib/domain/quotas";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("practice quota (1)");
check("practice sessions are a quota of their own", () => {
  const q = QUOTAS.find((x) => x.key === "practice");
  assert.ok(q);
  assert.equal(q.label, "Practice sessions");
  assert.equal(q.unit, "per month");
});
check("Free / Pro / Ultra get 3 / 40 / 150 practice sessions", () => {
  assert.deepEqual(PLANS.map((p) => p.caps.practice), [3, 40, 150]);
});
check("a practice cap of zero reads as Off", () => {
  assert.equal(displayCap("practice", 0), "Off");
});

check("only model-generated decks, rounds and challenges count — retakes, bank problems and reviews stay free", () => {
  const since = new Date("2026-10-01T00:00:00Z");
  assert.deepEqual(practiceSessionWhere("user_1", since), {
    clerkUserId: "user_1",
    createdAt: { gte: since },
    aiRunId: { not: null },
  });
});

check("buying a plan writes every cap, practice included — one column per QUOTAS row", () => {
  const cols = capColumns(PLANS[1].caps) as Record<string, number>;
  for (const q of QUOTAS) assert.equal(cols[q.column], PLANS[1].caps[q.key], q.column);
});

check("a new account gets every cap from the workspace defaults, practice included", () => {
  const cols = capsFromDefaults(PLANS[0].caps as never) as Record<string, number>;
  for (const q of QUOTAS) assert.equal(cols[q.column], PLANS[0].caps[q.key], q.column);
});

console.log("extra-analysis packs (2)");
check("inside the monthly cap, an analysis comes from the plan", () => {
  assert.deepEqual(analysesAvailable({ cap: 3, usedThisCycle: 2, bonusGranted: 5, bonusSpent: 0 }), { allowed: true, fromBonus: false });
});
check("past the cap, an unspent bonus analysis is used", () => {
  assert.deepEqual(analysesAvailable({ cap: 3, usedThisCycle: 3, bonusGranted: 5, bonusSpent: 0 }), { allowed: true, fromBonus: true });
});
check("past the cap with the bonus spent, the run is refused", () => {
  assert.deepEqual(analysesAvailable({ cap: 3, usedThisCycle: 3, bonusGranted: 5, bonusSpent: 5 }), { allowed: false, fromBonus: false });
});
check("unspent token top-ups convert to analyses, rounded up", () => {
  assert.equal(convertedAnalyses(30_001, 20_000), 2);
  assert.equal(convertedAnalyses(0, 20_000), 0);
});
check("packs are +5 analyses for ₹99 and +15 for ₹249", () => {
  assert.deepEqual(TOPUPS.map((t) => [t.analyses, t.pricePaise]), [[5, 9_900], [15, 24_900]]);
});
check("the old token packs stay creditable for orders placed before the switch", () => {
  assert.deepEqual(LEGACY_TOKEN_TOPUPS.map((t) => t.id), ["topup-100k", "topup-300k"]);
});

console.log("fair-use ceiling (3)");
check("the ceiling is every metered count at its worst-case cost, plus a quarter, rounded up to 10K", () => {
  const worst = { analysis: 40_000, answer: 3_000, revision: 6_000, quiz: 4_000, challenge: 8_000, review: 2_000 };
  const caps = { analyses: 40, answers: 40, practice: 40, resumes: 11, courses: 4, roadmaps: 40, jobSearches: 60 };
  // practice worst = max(deck, round, challenge + one review) = 10,000
  assert.equal(fairUseCeiling(caps, worst), Math.ceil(((40 * 40_000 + 40 * 3_000 + 40 * 10_000) * 1.25) / 10_000) * 10_000);
});
check("extra analyses raise the ceiling by their worst-case cost", () => {
  const caps = { analyses: 0, answers: 0, practice: 0, resumes: 0, courses: 0, roadmaps: 0, jobSearches: 0 };
  assert.equal(fairUseCeiling(caps, WORST_CASE, 5), Math.ceil((5 * WORST_CASE.analysis) / 10_000) * 10_000);
});
check("every plan's token ceiling sits above what its printed counts can spend (N22)", () => {
  for (const p of PLANS) assert.ok(p.caps.tokens >= fairUseCeiling(p.caps, WORST_CASE), p.id);
});
check("tokens are an internal quota; every other quota is printed", () => {
  assert.deepEqual(QUOTAS.filter((q) => q.internal).map((q) => q.key), ["tokens"]);
});
check("every ceiling fits the column's CHECK bound", () => {
  const max = QUOTAS.find((q) => q.key === "tokens")!.max;
  for (const p of PLANS) assert.ok(p.caps.tokens <= max, p.id);
});

console.log("member surfaces (4)");
check("no warning while every count has more than one left", () => {
  assert.equal(lowCountNotice({ analyses: 5, answers: 3, practice: 2 }), null);
});
check("one analysis left is named, in counts", () => {
  assert.deepEqual(lowCountNotice({ analyses: 1, answers: 9, practice: 9 }), { key: "analyses", empty: false, text: "1 analysis left this cycle." });
});
check("a used-up count says so, analyses first", () => {
  assert.deepEqual(lowCountNotice({ analyses: 0, answers: 0, practice: 9 }), { key: "analyses", empty: true, text: "You've used this cycle's analyses." });
  assert.deepEqual(lowCountNotice({ analyses: 9, answers: 0, practice: 9 }), { key: "answers", empty: true, text: "You've used this cycle's full answer drafts." });
});
check("a count that is Off for this plan never warns", () => {
  assert.equal(lowCountNotice({ analyses: 9, answers: 9, practice: null }), null);
});
check("the plan table never prints the internal quota", () => {
  const rows = compareRows(PLANS).map((r) => r.label);
  assert.ok(!rows.includes("Fair-use limit"));
  assert.ok(!rows.some((l) => /run costs/i.test(l)));
  assert.ok(!PLAN_ROWS.some((r) => r.key === "tokens"));
});

console.log(`ok — ${passed} checks`);

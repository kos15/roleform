/**
 * Counts-only pricing (docs/superpowers/specs/2026-10-21-pricing-without-tokens-design.md),
 * checked by hand — CLAUDE.md §11, not a suite.
 *
 *   pnpm check:quotas
 */
import assert from "node:assert/strict";
import { QUOTAS, displayCap } from "../lib/domain/quotas";
import { PLANS, TOPUPS, LEGACY_TOKEN_TOPUPS } from "../lib/content/pricing";
import { practiceSessionWhere, analysesAvailable, convertedAnalyses } from "../lib/domain/entitlements";
import { capColumns } from "../lib/plans/catalog";
import { capsFromDefaults } from "../lib/admin/defaults";

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

console.log(`ok — ${passed} checks`);

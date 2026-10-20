/**
 * Counts-only pricing (docs/superpowers/specs/2026-10-21-pricing-without-tokens-design.md),
 * checked by hand — CLAUDE.md §11, not a suite.
 *
 *   pnpm check:quotas
 */
import assert from "node:assert/strict";
import { QUOTAS, displayCap } from "../lib/domain/quotas";
import { PLANS } from "../lib/content/pricing";
import { practiceSessionWhere } from "../lib/domain/entitlements";
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

console.log(`ok — ${passed} checks`);

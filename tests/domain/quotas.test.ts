import { it } from "vitest";
/**
 * Counts-only pricing (docs/superpowers/specs/2026-10-21-pricing-without-tokens-design.md).
 */
import assert from "node:assert/strict";
import { QUOTAS, displayCap } from "@/lib/domain/quotas";
import { PLANS, TOPUPS, LEGACY_TOKEN_TOPUPS, PLAN_ROWS, compareRows } from "@/lib/content/pricing";
import { practiceSessionWhere, analysesAvailable, convertedAnalyses } from "@/lib/domain/entitlements";
import { capColumns } from "@/lib/plans/catalog";
import { capsFromDefaults } from "@/lib/admin/defaults";
import { fairUseCeiling, WORST_CASE } from "@/lib/domain/tokens";
import { lowCountNotice } from "@/lib/domain/quotas";
import { withFairUseFloor, fairUseWall, headroomFor } from "@/lib/domain/tokens";
import { FEATURES } from "@/lib/domain/features";
import { readFileSync } from "node:fs";
import { ANALYSIS_TOKEN_CEILING } from "@/lib/domain/tokens";
import { unspentTopups } from "@/lib/db/queries/tokens";
import { PRE_CHANGE_ALLOWANCE } from "@/lib/domain/entitlements";
it("practice sessions are a quota of their own", () => {
  const q = QUOTAS.find((x) => x.key === "practice");
  assert.ok(q);
  assert.equal(q.label, "Practice sessions");
  assert.equal(q.unit, "per month");
});
it("Free / Pro / Ultra get 3 / 40 / 150 practice sessions", () => {
  assert.deepEqual(PLANS.map((p) => p.caps.practice), [3, 40, 150]);
});
it("a practice cap of zero reads as Off", () => {
  assert.equal(displayCap("practice", 0), "Off");
});

it("only model-generated decks, rounds and challenges count — retakes, bank problems and reviews stay free", () => {
  const since = new Date("2026-10-01T00:00:00Z");
  assert.deepEqual(practiceSessionWhere("user_1", since), {
    clerkUserId: "user_1",
    createdAt: { gte: since },
    aiRunId: { not: null },
  });
});

it("buying a plan writes every cap, practice included — one column per QUOTAS row", () => {
  const cols = capColumns(PLANS[1].caps) as Record<string, number>;
  for (const q of QUOTAS) assert.equal(cols[q.column], PLANS[1].caps[q.key], q.column);
});

it("a new account gets every cap from the workspace defaults, practice included", () => {
  const cols = capsFromDefaults(PLANS[0].caps as never) as Record<string, number>;
  for (const q of QUOTAS) assert.equal(cols[q.column], PLANS[0].caps[q.key], q.column);
});
it("inside the monthly cap, an analysis comes from the plan", () => {
  assert.deepEqual(analysesAvailable({ cap: 3, usedThisCycle: 2, bonusGranted: 5, bonusSpent: 0 }), { allowed: true, fromBonus: false });
});
it("past the cap, an unspent bonus analysis is used", () => {
  assert.deepEqual(analysesAvailable({ cap: 3, usedThisCycle: 3, bonusGranted: 5, bonusSpent: 0 }), { allowed: true, fromBonus: true });
});
it("past the cap with the bonus spent, the run is refused", () => {
  assert.deepEqual(analysesAvailable({ cap: 3, usedThisCycle: 3, bonusGranted: 5, bonusSpent: 5 }), { allowed: false, fromBonus: false });
});
it("unspent token top-ups convert to analyses, rounded up", () => {
  assert.equal(convertedAnalyses(30_001, 20_000), 2);
  assert.equal(convertedAnalyses(0, 20_000), 0);
});
it("packs are +5 analyses for ₹99 and +15 for ₹249", () => {
  assert.deepEqual(TOPUPS.map((t) => [t.analyses, t.pricePaise]), [[5, 9_900], [15, 24_900]]);
});
it("the old token packs stay creditable for orders placed before the switch", () => {
  assert.deepEqual(LEGACY_TOKEN_TOPUPS.map((t) => t.id), ["topup-100k", "topup-300k"]);
});
it("the ceiling is every metered count at its worst-case cost, plus a quarter, rounded up to 10K", () => {
  const worst = { analysis: 40_000, answer: 3_000, revision: 6_000, quiz: 4_000, challenge: 8_000, review: 2_000 };
  const caps = { analyses: 40, answers: 40, practice: 40, resumes: 11, courses: 4, roadmaps: 40, jobSearches: 60 };
  // practice worst = max(deck, round, challenge + one review) = 10,000
  assert.equal(fairUseCeiling(caps, worst), Math.ceil(((40 * 40_000 + 40 * 3_000 + 40 * 10_000) * 1.25) / 10_000) * 10_000);
});
it("extra analyses raise the ceiling by their worst-case cost", () => {
  const caps = { analyses: 0, answers: 0, practice: 0, resumes: 0, courses: 0, roadmaps: 0, jobSearches: 0 };
  assert.equal(fairUseCeiling(caps, WORST_CASE, 5), Math.ceil((5 * WORST_CASE.analysis) / 10_000) * 10_000);
});
it("every plan's token ceiling sits above what its printed counts can spend (N22)", () => {
  for (const p of PLANS) assert.ok(p.caps.tokens >= fairUseCeiling(p.caps, WORST_CASE), p.id);
});
it("tokens are an internal quota; every other quota is printed", () => {
  assert.deepEqual(QUOTAS.filter((q) => q.internal).map((q) => q.key), ["tokens"]);
});
it("every ceiling fits the column's CHECK bound", () => {
  const max = QUOTAS.find((q) => q.key === "tokens")!.max;
  for (const p of PLANS) assert.ok(p.caps.tokens <= max, p.id);
});
it("no warning while every count has more than one left", () => {
  assert.equal(lowCountNotice({ analyses: 5, answers: 3, practice: 2 }), null);
});
it("one analysis left is named, in counts", () => {
  assert.deepEqual(lowCountNotice({ analyses: 1, answers: 9, practice: 9 }), { key: "analyses", empty: false, text: "1 analysis left this cycle." });
});
it("a used-up count says so, analyses first", () => {
  assert.deepEqual(lowCountNotice({ analyses: 0, answers: 0, practice: 9 }), { key: "analyses", empty: true, text: "You've used this cycle's analyses." });
  assert.deepEqual(lowCountNotice({ analyses: 9, answers: 0, practice: 9 }), { key: "answers", empty: true, text: "You've used this cycle's full answer drafts." });
});
it("a count that is Off for this plan never warns", () => {
  assert.equal(lowCountNotice({ analyses: 9, answers: 9, practice: null }), null);
});
it("the plan table never prints the internal quota", () => {
  const rows = compareRows(PLANS).map((r) => r.label);
  assert.ok(!rows.includes("Fair-use limit"));
  assert.ok(!rows.some((l) => /run costs/i.test(l)));
  assert.ok(!PLAN_ROWS.some((r) => r.key === "tokens"));
});
it("I1: conversion measures past overruns against the PRE-change allowance", () => {
  // A Pro member overran 800K by 300K last cycle: the 300K pack is spent.
  const usage = { current: 0, past: [1_100_000] };
  assert.equal(convertedAnalyses(unspentTopups(300_000, usage, PRE_CHANGE_ALLOWANCE.pro), 20_000), 0);
  assert.deepEqual(PRE_CHANGE_ALLOWANCE, { free: 60_000, pro: 800_000, ultra: 3_000_000 });
});
it("I2: a legacy token pack paid after the switch credits the analyses it was sold as", () => {
  assert.deepEqual(LEGACY_TOKEN_TOPUPS.map((t) => [t.id, t.analyses]), [["topup-100k", 5], ["topup-300k", 15]]);
});
it("I3: one analysis's worst case covers the whole per-run ceiling", () => {
  assert.ok(WORST_CASE.analysis >= ANALYSIS_TOKEN_CEILING);
});
it("I3: raising counts by hand lifts the hidden ceiling with them", () => {
  const caps = { ...PLANS[0].caps, analyses: 100, tokens: 1 };
  const floored = withFairUseFloor(caps);
  assert.ok(floored.tokens >= fairUseCeiling(caps, WORST_CASE));
  assert.equal(withFairUseFloor({ ...PLANS[0].caps, tokens: 19_000_000 }).tokens, 19_000_000);
});
const wallArgs = {
  planName: "Pro",
  resetDate: "26 Oct",
  resetIn: "in 5 days",
  upgrade: { id: "ultra", name: "Ultra", price: "₹1,299", note: "More" },
  topups: [{ id: "topup-5a", name: "5 extra analyses", price: "₹99", analyses: 5, note: "One-off" }],
};
it("M3: analysis packs are offered only on an analysis wall", () => {
  assert.equal(fairUseWall({ kind: "analysis", ...wallArgs }).topups.length, 1);
  assert.equal(fairUseWall({ kind: "answer", ...wallArgs }).topups.length, 0);
  assert.equal(fairUseWall({ kind: "quiz", ...wallArgs }).topups.length, 0);
});
it("M3: a pack's headroom lifts the ceiling for analyses only", () => {
  assert.equal(headroomFor("analysis", 120_000), 120_000);
  assert.equal(headroomFor("answer", 120_000), 0);
  assert.equal(headroomFor("challenge", 120_000), 0);
});
it("M4: the wall the browser receives carries no balance, shortfall, estimate or stages", () => {
  const wall = fairUseWall({ kind: "analysis", ...wallArgs }) as unknown as Record<string, unknown>;
  for (const k of ["balance", "shortfall", "estimate", "stages"]) assert.ok(!(k in wall), k);
});
it("M6: the usage panel uses radius tokens, not pixel radii (N9)", () => {
  const src = readFileSync("app/(app)/profile/usage-panel.tsx", "utf8");
  assert.doesNotMatch(src, /rounded-\[\d+px\]/);
});
it("M7: the AI fact-checkers switch says it also covers the injection check", () => {
  assert.match(FEATURES.find((f) => f.key === "ai_checkers")!.description, /injection/i);
});

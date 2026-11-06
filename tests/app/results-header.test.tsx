import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";
import { ResultsHeader } from "@/app/(app)/analysis/[id]/results-header";
import type { DomainCoverageItem, DomainRequirement } from "@/lib/domain/types";
(globalThis as { React?: typeof React }).React = React;
const has = (h: string, s: string) => assert.ok(h.includes(s), `missing "${s}"`);

const req = (id: string, skillName: string | null, text: string): DomainRequirement =>
  ({ id, kind: "hard_skill", text, necessity: "required", mentionCount: 1, skillName, evidenceQuote: "quoted" });
const requirements = [req("r1", "Kubernetes", "Kubernetes"), req("r2", "Terraform", "Terraform"), req("r3", "Rust", "Rust"), req("r4", null, "Mentors junior engineers")];
const coverage: DomainCoverageItem[] = [
  { requirementId: "r1", status: "evidenced", evidenceBulletIds: ["b1"], rationale: "r" },
  { requirementId: "r2", status: "partial", evidenceBulletIds: [], rationale: "r" },
  { requirementId: "r3", status: "absent", evidenceBulletIds: [], rationale: "r" },
]; // r4 has no row → absent
const html = renderToStaticMarkup(createElement(ResultsHeader, {
  analysis: { jdSource: "paste", jdFilename: null, company: "Acme", title: "Staff Platform Engineer", location: "Bengaluru", seniority: "Senior", employmentType: "Full-time", score: 58, scoreVerdict: "Strong on delivery", scoreNote: "Thin on infra", truncated: false, protectedNotice: null, fromSavedJob: false },
  requirements, coverage, bulletTexts: { b1: "Ran 40 clusters" },
}));
const iScore = html.indexOf('data-tour="score"'), iCov = html.indexOf('data-tour="coverage"');
const card = html.slice(iScore, iCov);

describe("ResultsHeader", () => {
  it("title, then the ring card, then the requirement detail", () => {
    assert.ok(html.indexOf("<h1") >= 0 && html.indexOf("<h1") < iScore && iScore < iCov);
  });
  it("N4: the ring and all three bucket counts share one card, at every width", () => {
    has(card, "58 percent of this posting");
    has(card, ">match<");
    has(card, "№ 4 requirements");
    assert.match(card, /data-bucket="evidenced"[^]*?Strong match[^]*?>1</);
    assert.match(card, /data-bucket="partial"[^]*?Partial evidence[^]*?>1</);
    assert.match(card, /data-bucket="absent"[^]*?Not evidenced[^]*?>2</);
    assert.ok(!/class="[^"]*\b(hidden|more-copy)\b/.test(card), "bucket counts must show on every screen (specs F0)");
  });
  it("requirement tags sit in one disclosure, closed by default, all inside", () => {
    const tag = html.match(/<details[^>]*data-tour="coverage"[^>]*>/);
    assert.ok(tag && !/\sopen[\s=>]/.test(tag[0]));
    for (const s of ["Kubernetes", "Terraform", "Rust", "Mentors junior engineers"]) has(html.slice(iCov), s);
  });
  it("no decorative card: each meta value renders once", () => {
    assert.equal(html.split("Bengaluru").length - 1, 1);
    assert.equal(html.split("Full-time").length - 1, 1);
  });
  it("the coverage note stays visible, before the disclosure", () => {
    const n = html.indexOf("Not a prediction");
    assert.ok(n > 0 && n < iCov);
  });
  it("the disclosure summary may wrap on a narrow phone", () => {
    const summary = html.match(/<summary[^>]*class="([^"]*)"/);
    assert.ok(summary && summary[1].includes("whitespace-normal"), "summary must override .tag's nowrap");
  });
});

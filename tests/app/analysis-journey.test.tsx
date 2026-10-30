import { describe, it } from "vitest";
/**
 * Renders the analysis dock (phone bar + desktop rail) and the "Up next" card
 * over a fixed analysis, at a given section.
 */
import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PhoneDock, SectionRail } from "@/app/(app)/analysis/[id]/analysis-dock";
import { JourneyCard } from "@/app/(app)/analysis/[id]/analysis-journey";
import type { SectionSlug } from "@/lib/domain/analysis-nav";

(globalThis as { React?: typeof React }).React = React;

const labels: Record<SectionSlug, string> = {
  resumes: "11",
  prep: "14",
  learning: "3 gaps",
  schedule: "Set a date",
  roadmap: "—",
  rapid: "3 drills",
  rounds: "Add one",
};
const has = (html: string, s: string) => assert.ok(html.includes(s), `missing "${s}"`);
const lacks = (html: string, s: string) => assert.ok(!html.includes(s), `unexpected "${s}"`);
const count = (html: string, s: string) => html.split(s).length - 1;

describe("PhoneDock", () => {
  const render = (current: SectionSlug | null, hidden: string[] = []) =>
    renderToStaticMarkup(
      createElement(PhoneDock, {
        analysisId: "a1",
        title: "Staff Engineer",
        labels,
        hidden,
        current,
        elsewhere: [{ href: "/analyze", label: "New analysis" }],
      }),
    );

  it("carries four sections and More, marking where you are", () => {
    const html = render("prep");
    has(html, 'class="tabbar analysis-dock"');
    for (const s of ["/analysis/a1/resumes", "/analysis/a1/prep", "/analysis/a1/learning", "/analysis/a1/schedule"]) has(html, s);
    lacks(html, "/analysis/a1/rounds");
    has(html, "More");
    assert.equal(count(html, 'aria-current="page"'), 1);
  });

  it("gives the section you are on a slot even when it is far along", () => {
    const html = render("rounds");
    has(html, "/analysis/a1/rounds");
    lacks(html, "/analysis/a1/schedule");
  });

  it("drops switched-off sections", () => {
    lacks(render("prep", ["schedule"]), "/analysis/a1/schedule");
  });
});

describe("SectionRail", () => {
  it("links every visible section with its count, and starts hidden", () => {
    const html = renderToStaticMarkup(
      createElement(SectionRail, { analysisId: "a1", title: "Staff Engineer", labels, hidden: ["rapid"], current: "learning" }),
    );
    has(html, 'data-shown="false"');
    has(html, "3 gaps");
    has(html, "Staff Engineer");
    lacks(html, "/analysis/a1/rapid");
    assert.equal(count(html, 'href="/analysis/a1/'), 6);
  });
});

describe("JourneyCard", () => {
  const render = (current: SectionSlug | null, hidden: string[] = []) =>
    renderToStaticMarkup(createElement(JourneyCard, { analysisId: "a1", labels, hidden, current }));

  it("names the step and offers the next section with its count", () => {
    const html = render("resumes");
    has(html, "Step 1 of 7");
    has(html, 'href="/analysis/a1/prep"');
    has(html, "Up next · 14");
    has(html, "Interview prep");
    lacks(html, "Back to");
  });

  it("offers the way back from a middle step", () => {
    has(render("learning"), "Back to Interview prep");
  });

  it("closes the path at the last step with a new analysis and History", () => {
    const html = render("rounds");
    has(html, "That&rsquo;s the whole path".replace("&rsquo;", "’"));
    has(html, 'href="/analyze"');
    has(html, 'href="/history"');
  });

  it("renders nothing off the path", () => {
    assert.equal(render(null), "");
  });
});

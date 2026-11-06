import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it, vi } from "vitest";
(globalThis as { React?: typeof React }).React = React;
const has = (h: string, s: string) => assert.ok(h.includes(s), `missing "${s}"`);
const lacks = (h: string, s: string) => assert.ok(!h.includes(s), `unexpected "${s}"`);
const at = (src: string, s: string) => { const i = src.indexOf(s); assert.ok(i >= 0, `missing ${s}`); return i; };

vi.mock("@/app/actions/jobs", () => ({ setSavedJobStatus: vi.fn(), unsaveJob: vi.fn(), setSavedJobNote: vi.fn() }));
import { SavedJobsPanel } from "@/app/(app)/jobs/saved-jobs-panel";
import { sourceOf } from "../structure/files";
const src = sourceOf("app/(app)/jobs/page.tsx");

it("search is the main column; saved jobs are the rail", () => {
  has(src, 'railLabel="Saved jobs"');
  has(src, "rail={<SavedJobsPanel jobs={saved} />}");
  assert.equal(src.split("<SavedJobsPanel").length - 1, 1);
  assert.ok(at(src, "<WithRail") < at(src, "<JobSearchClient"));
});
it("a compact intro with the shorter standfirst", () => {
  has(src, "<PageIntro compact");
  has(src, "Listings are sorted by facts you can check, never by a score.");
  lacks(src, "your skills it names, the ones it asks for");
});
it("the empty tracker no longer points 'above'", () => {
  const html = renderToStaticMarkup(createElement(SavedJobsPanel, { jobs: [] }));
  has(html, "Save a listing to track it here.");
  lacks(html, "above");
});

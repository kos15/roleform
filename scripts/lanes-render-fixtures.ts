/**
 * Renders the Learning tab's Watch | Read lanes over hand-built gaps, checked by hand — CLAUDE.md §11.
 *
 *   pnpm check:lanes-render
 */
import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Lanes } from "../app/(app)/analysis/[id]/learning/lanes";
import type { LearningStepView } from "../lib/db/queries/learning";

// tsx compiles the component with the classic JSX transform here (the scripts
// tsconfig only includes .ts), so it looks for a global React.
(globalThis as { React?: typeof React }).React = React;

function step(over: Partial<LearningStepView>): LearningStepView {
  return {
    id: "s", courseId: "c", title: "A title", provider: "Prov", author: null, mark: "1",
    url: "https://example.com/a", entryUrl: null, entryLabel: null, priceLabel: "Free",
    isFree: true, durationMin: 30, note: "", order: 0, startsAtMin: 0, deferred: false,
    lane: "watch", docKind: null, isPrimary: true, ...over,
  };
}
const render = (steps: LearningStepView[], cappedLanes: ("watch" | "read")[]) =>
  renderToStaticMarkup(createElement(Lanes, { steps, cappedLanes }));
const has = (html: string, s: string) => assert.ok(html.includes(s), `missing "${s}"`);
const lacks = (html: string, s: string) => assert.ok(!html.includes(s), `unexpected "${s}"`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

check("both lanes full, deferred primary, alternative marker, doc kind", () => {
  const html = render(
    [
      step({ id: "a", deferred: true, startsAtMin: 0 }),
      step({ id: "b", lane: "read", docKind: "official", isPrimary: false }),
      step({ id: "c", lane: "read", docKind: "tutorial", isPrimary: false }),
    ],
    [],
  );
  for (const s of ["Watch", "Read", "Official", "Tutorial", "or read this instead", "Outside your budget"]) has(html, s);
  lacks(html, "No vetted");
  lacks(html, "higher plan");
});

check("docs-only: Watch lane says no vetted videos; primary shows budget tag", () => {
  const html = render([step({ id: "d", lane: "read", docKind: "official", startsAtMin: 90 })], []);
  has(html, "No vetted videos for this yet");
  has(html, "from 1h 30m in");
  lacks(html, "Outside your budget");
});

check("quota-emptied: both lanes show only the higher-plan line", () => {
  const html = render([], ["watch", "read"]);
  has(html, "More videos on a higher plan");
  has(html, "More reading on a higher plan");
  lacks(html, "No vetted");
});

check("non-empty capped lane shows rows then the higher-plan line", () => {
  const html = render([step({ id: "e" })], ["watch"]);
  has(html, "A title");
  has(html, "More videos on a higher plan");
  has(html, "No vetted reading for this yet");
});

console.log(`\n${passed} checks passed`);

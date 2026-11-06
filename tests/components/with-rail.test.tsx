import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it } from "vitest";
import { WithRail } from "@/components/with-rail";
(globalThis as { React?: typeof React }).React = React;
const has = (h: string, s: string) => assert.ok(h.includes(s), `missing "${s}"`);

const render = (rail: React.ReactNode) =>
  renderToStaticMarkup(createElement(WithRail, { railLabel: "Saved jobs", rail, children: createElement("p", null, "MAIN") }));

it("puts the main column first and the labelled rail after it", () => {
  const html = render(createElement("p", null, "RAIL"));
  assert.ok(html.indexOf("MAIN") < html.indexOf("<aside"), "main must precede the rail in the DOM (phones stack it below)");
  assert.match(html, /<aside[^>]*aria-label="Saved jobs"[^>]*>.*RAIL/);
  has(html, "lg:flex-row");
});

it("an empty rail renders an empty aside that hides itself", () => {
  assert.match(render(null), /<aside[^>]*class="[^"]*\bempty:hidden\b[^"]*"[^>]*><\/aside>/);
});

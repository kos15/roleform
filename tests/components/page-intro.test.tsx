import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it } from "vitest";
import { PageIntro, APP_TITLE } from "@/components/page-intro";
(globalThis as { React?: typeof React }).React = React;
const has = (h: string, s: string) => assert.ok(h.includes(s), `missing "${s}"`);

it("without actions or compact, renders exactly as before (marketing pages)", () => {
  assert.equal(
    renderToStaticMarkup(createElement(PageIntro, { kicker: "K", title: "T", children: "S" })),
    '<div class="mb-[clamp(2rem,4vw,3rem)] max-w-[62ch]"><p class="eyebrow mb-3.5">K</p><h1 class="mb-[18px]">T</h1><p class="text-[15px] leading-relaxed text-[var(--color-text-muted)] sm:text-[17px]">S</p></div>',
  );
});
it("puts actions in a slot after the title", () => {
  const html = renderToStaticMarkup(createElement(PageIntro, { kicker: "K", title: "T", actions: createElement("a", { href: "/x" }, "Act") }));
  has(html, 'data-slot="page-actions"');
  assert.ok(html.indexOf("<h1") < html.indexOf('data-slot="page-actions"'));
  assert.match(html, /data-slot="page-actions"[^>]*><a href="\/x">Act<\/a>/);
});
it("compact uses the one app title size", () => {
  assert.equal(APP_TITLE, "text-[clamp(2rem,4.2vw,3.5rem)]");
  has(renderToStaticMarkup(createElement(PageIntro, { kicker: "K", title: "T", compact: true })), `<h1 class="mb-3 ${APP_TITLE}">T</h1>`);
});

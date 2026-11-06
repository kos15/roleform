import assert from "node:assert/strict";
import { it } from "vitest";
import { sourceOf } from "../structure/files";
const at = (src: string, s: string) => { const i = src.indexOf(s); assert.ok(i >= 0, `missing ${s}`); return i; };
const src = sourceOf("app/(app)/analysis/[id]/layout.tsx");

it("header, then tabs, then the section, then the promo strip, then Up next", () => {
  const [h, t, s, p, j] = ["<ResultsHeader", "<AnalysisTabs", "{children}</div>", "<PromoMarquee", "<AnalysisJourney"].map((x) => at(src, x));
  assert.ok(h < t && t < s, "tabs must follow the header and precede the section");
  assert.ok(s < p && p < j, "promo strip must follow the section and precede Up next");
});
it("no full-width divider between the header and the tabs", () => {
  assert.ok(!src.includes("h-px bg-[var(--color-line)]"));
});

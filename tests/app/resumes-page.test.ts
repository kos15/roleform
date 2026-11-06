import assert from "node:assert/strict";
import { it } from "vitest";
import { sourceOf } from "../structure/files";
const at = (src: string, s: string) => { const i = src.indexOf(s); assert.ok(i >= 0, `missing ${s}`); return i; };
const src = sourceOf("app/(app)/analysis/[id]/resumes/page.tsx");

it("header row, then the shelf, then the skill offer, then the portfolio promo", () => {
  const [d, shelf, sc, pp] = ["<DownloadAll", 'data-tour="shelf"', "<SkillConsent", "<PortfolioPromo"].map((x) => at(src, x));
  assert.ok(d < shelf, "Download all stays in the header row above the shelf");
  assert.ok(shelf < sc && sc < pp, "skill offer and portfolio promo must follow the shelf");
});

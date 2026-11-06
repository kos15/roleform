import assert from "node:assert/strict";
import { it } from "vitest";
import { sourceOf } from "../structure/files";
const has = (h: string, s: string) => assert.ok(h.includes(s), `missing "${s}"`);
const at = (src: string, s: string) => { const i = src.indexOf(s); assert.ok(i >= 0, `missing ${s}`); return i; };
const src = sourceOf("app/(app)/history/page.tsx");

it("the list is the main column; upcoming rounds are the rail", () => {
  has(src, 'railLabel="Upcoming rounds"');
  has(src, "rail={<UpcomingRounds clerkUserId={userId} />}");
  assert.equal(src.split("<UpcomingRounds").length - 1, 1);
  const w = at(src, "<WithRail"), end = at(src, "</WithRail>");
  assert.ok(w < at(src, "<table") && at(src, "<table") < end);
});
it("title uses the app title size", () => has(src, "className={APP_TITLE}"));

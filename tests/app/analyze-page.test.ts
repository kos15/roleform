import assert from "node:assert/strict";
import { it } from "vitest";
import { sourceOf } from "../structure/files";
const has = (h: string, s: string) => assert.ok(h.includes(s), `missing "${s}"`);
const at = (src: string, s: string) => { const i = src.indexOf(s); assert.ok(i >= 0, `missing ${s}`); return i; };
const src = sourceOf("app/(app)/analyze/page.tsx");

it("the posting box is first; parked runs lead the aside", () => {
  const [jd, aside, q, card] = ["<JdInput", "<aside", "<QueuedRuns", "<Card flat"].map((s) => at(src, s));
  assert.ok(jd < aside && aside < q && q < card, "QueuedRuns must sit at the top of the aside, after JdInput");
});
it("the hero uses the app title size", () => has(src, "${APP_TITLE}"));

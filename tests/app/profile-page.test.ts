import assert from "node:assert/strict";
import { it } from "vitest";
import { sourceOf } from "../structure/files";
const has = (h: string, s: string) => assert.ok(h.includes(s), `missing "${s}"`);
const at = (src: string, s: string) => { const i = src.indexOf(s); assert.ok(i >= 0, `missing ${s}`); return i; };
const src = sourceOf("app/(app)/profile/page.tsx");

it("the header carries the actions slot with Replace résumé", () => {
  const intro = src.slice(at(src, "<PageIntro"), at(src, "</PageIntro>"));
  for (const s of ["compact", "actions={", 'href="/onboarding"', "Replace résumé"]) has(intro, s);
});
it("account controls sit together in one block after the editor", () => {
  const block = at(src, 'id="account-heading"');
  assert.ok(at(src, "<ProfileEditor") < block);
  assert.ok(src.lastIndexOf("{accountName}") > block);
  assert.ok(block < at(src, "<NotificationsPanel") && at(src, "<NotificationsPanel") < at(src, "<DeleteAccount"));
});
it("without a profile, the import prompt comes before the name form", () => {
  assert.ok(at(src, 'title="No profile yet"') < at(src, "{accountName}"));
});

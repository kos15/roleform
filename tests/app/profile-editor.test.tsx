import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it, vi } from "vitest";
(globalThis as { React?: typeof React }).React = React;
const has = (h: string, s: string) => assert.ok(h.includes(s), `missing "${s}"`);
const lacks = (h: string, s: string) => assert.ok(!h.includes(s), `unexpected "${s}"`);
const at = (src: string, s: string) => { const i = src.indexOf(s); assert.ok(i >= 0, `missing ${s}`); return i; };

vi.mock("@/app/actions/onboarding", () => ({ updateProfile: vi.fn() }));
import { IdentitySection, ProfileEditor } from "@/app/(app)/profile/profile-editor";
import type { StoredResume } from "@/lib/ai/schemas/resume-json";

const resume: StoredResume = {
  basics: { name: "Asha Rao", label: "Platform Engineer", email: "asha@example.com", phone: "", url: "", summary: "Builds platforms.", location: { city: "Pune", region: "MH", countryCode: "IN" }, profiles: [] },
  work: [{ name: "Acme", position: "Engineer", location: "", startDate: "2021-01", endDate: null, summary: "", highlights: ["Cut deploy time 40%"] }],
  education: [], skills: [{ name: "Go", level: "Deep", keywords: [] }], projects: [], certificates: [], volunteer: [], awards: [], languages: [],
};
const html = renderToStaticMarkup(createElement(ProfileEditor, {
  initial: resume, evidenceByPath: {}, suggestions: [], bulletCount: 1, sourceFilename: null,
  updatedAt: "2026-11-01T00:00:00.000Z", tokenPanel: createElement("div", { id: "usage-probe" }),
}));

it("main column: Identity, Summary, Experience, then Skills, then projects", () => {
  const idx = [">Identity &amp; contact<", ">Summary<", ">Experience<", ">Skills<", ">Personal projects<"].map((s) => at(html, s));
  assert.deepEqual([...idx].sort((a, b) => a - b), idx);
});

it("aside: strength, checks, Save, then the usage meter", () => {
  const [aside, ring, checks, save, meter] = ["<aside", "profile strength", "helping, what", "Save profile", 'id="usage-probe"'].map((s) => at(html, s));
  assert.ok(aside < ring && ring < checks && checks < save && save < meter);
});

it("Identity opens collapsed to one line", () => {
  has(html, "Asha Rao · Platform Engineer · Pune · asha@example.com");
  has(html, "Edit details");
  const fields = html.match(/<div[^>]*id="identity-fields"[^>]*>/);
  assert.ok(fields && /\shidden(=""|[\s>])/.test(fields[0]));
});

it("Identity open shows the fields", () => {
  const open = renderToStaticMarkup(createElement(IdentitySection, { resume, patch: () => {}, sourceFilename: null, updatedAt: "2026-11-01T00:00:00.000Z", bulletCount: 1, open: true, onToggle: () => {} }));
  has(open, 'aria-expanded="true"');
  has(open, "Full name");
  has(open, "Hide details");
  lacks(open, "asha@example.com</p>");
  assert.ok(!/id="identity-fields"[^>]*\shidden/.test(open));
});

it("Replace résumé lives in the page header, not the editor", () => lacks(html, "Replace résumé"));

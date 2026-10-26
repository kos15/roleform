import { describe, expect, it } from "vitest";
import { catalogHash, catalogSeedRows, SEED_FORMAT, unknownSkillNames } from "@/lib/catalog/seed-rows";
import { COURSES } from "@/lib/catalog/courses";
import { SKILLS } from "@/lib/catalog/skills";
import { qualityOf } from "@/lib/catalog/quality";
import { TEMPLATES } from "@/lib/render/templates";

const rows = catalogSeedRows();

describe("catalogSeedRows", () => {
  it("one row per source entry, in source order", () => {
    expect(rows.templates).toHaveLength(TEMPLATES.length);
    expect(rows.skills).toHaveLength(SKILLS.length);
    expect(rows.courses.map((c) => c.url)).toEqual(COURSES.map((c) => c.url));
    expect(rows.courseSkills).toHaveLength(COURSES.reduce((n, c) => n + c.skills.length, 0));
  });
  it("the first course is written exactly as the seed writes it", () => {
    expect(rows.courses[0]).toEqual({ url: "https://roadmap.sh/frontend", provider: "roadmap.sh", title: "Frontend Developer Roadmap",
      priceLabel: "Free", lengthLabel: "Self-paced", lengthMinutes: 600, level: "beginner", mark: "RS", isFree: true,
      skills: ["HTML", "CSS", "JavaScript"], type: "roadmap", qualityScore: "0.873", tags: ["html", "css", "javascript"],
      docKind: null, isOverview: false });
    expect(rows.courseSkills.slice(0, 2)).toEqual([
      { courseUrl: "https://roadmap.sh/frontend", skillName: "HTML", level: "intro", confidence: "1.000", isPrimary: true, summary: "Introduces HTML from scratch" },
      { courseUrl: "https://roadmap.sh/frontend", skillName: "CSS", level: "intro", confidence: "0.600", isPrimary: false, summary: "Covers CSS as part of HTML" },
    ]);
  });
  it("qualityScore is derived, not authored", () => {
    rows.courses.forEach((r, i) => expect(r.qualityScore).toBe(qualityOf(COURSES[i]).toFixed(3)));
  });
  it("a doc row carries its docKind", () => {
    const i = COURSES.findIndex((c) => c.docKind === "official");
    expect(rows.courses[i].docKind).toBe("official");
  });
  it("skills carry taxonomy depth and parent by name", () => {
    expect(rows.skills.find((s) => s.name === "Next.js")).toMatchObject({ parent: "React", depth: 2, slug: "next-js" });
    expect(rows.skills.find((s) => s.name === "JavaScript")).toMatchObject({ parent: null, depth: 0 });
  });
  it("templates carry only the written fields", () => {
    expect(Object.keys(rows.templates[0]).sort()).toEqual(["accent", "blurb", "id", "kind", "name", "structuralFlags"]);
  });
  it("no row carries a stamp, status or id", () => {
    for (const r of rows.courses) for (const k of ["verifiedAt", "checkedAt", "status", "id", "skillIds"]) expect(k in r).toBe(false);
  });
  it("hash: 64 hex, stable across calls and key order", () => {
    const h = catalogHash(rows);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(catalogHash(catalogSeedRows())).toBe(h);
    const reordered = JSON.parse(JSON.stringify(rows, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v)));
    expect(catalogHash(reordered)).toBe(h);
  });
  it("hash moves with a derived field and with SEED_FORMAT", () => {
    const changed = structuredClone(rows);
    changed.courses[0].qualityScore = "0.001";
    expect(catalogHash(changed)).not.toBe(catalogHash(rows));
    expect(catalogHash(rows, SEED_FORMAT + 1)).not.toBe(catalogHash(rows));
  });
  it("unknownSkillNames finds a typo'd skill", () => {
    expect(unknownSkillNames(rows)).toEqual([]);
    const bad = catalogSeedRows({ templates: TEMPLATES, skills: SKILLS, courses: [{ ...COURSES[0], skills: ["HTML", "Reactt"] }] });
    expect(unknownSkillNames(bad)).toEqual(["Reactt"]);
  });
});

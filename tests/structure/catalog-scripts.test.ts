/**
 * The catalog scripts keep the corpus honest: both use checkCourseLink (oEmbed
 * for videos), and the seed gates on catalogProblems before it writes anything
 * and writes the doc columns the DB CHECK `courses_doc_needs_kind` requires.
 */
import { describe, expect, it } from "vitest";
import { sourceOf } from "./files";

const SEED = "scripts/catalog/seed-catalog.ts";
const LINK_CHECK = "scripts/catalog/link-check.ts";

describe("catalog scripts", () => {
  for (const file of [SEED, LINK_CHECK]) {
    it(`${file} checks links with checkCourseLink, not checkLiveness`, () => {
      const src = sourceOf(file);
      expect(src).toContain("checkCourseLink(");
      expect(src).not.toContain("checkLiveness");
    });
  }

  it("the seed gates on catalogProblems before its first write", () => {
    const src = sourceOf(SEED);
    expect(src.indexOf("catalogProblems(")).toBeGreaterThan(-1);
    expect(src.indexOf("catalogProblems(")).toBeLessThan(src.indexOf("db.template.upsert"));
  });

  it("the seed writes docKind and isOverview", () => {
    const src = sourceOf(SEED);
    expect(src).toContain("docKind:");
    expect(src).toContain("isOverview:");
  });

  // courses_doc_needs_kind: a doc row with doc_kind NULL is rejected. The shared
  // `curation` object is spread into BOTH the create and the update data of the
  // course upsert (including the --skip-link-check update, which writes no
  // status or checked_at), so asserting the spread count and the object's
  // content pins every path.
  it("docKind and isOverview reach create AND update of the course upsert", () => {
    const src = sourceOf(SEED);
    const upsert = src.slice(src.indexOf("db.course.upsert"));
    const create = upsert.slice(upsert.indexOf("create:"), upsert.indexOf("update:"));
    const update = upsert.slice(upsert.indexOf("update:"), upsert.indexOf("select:"));
    expect(src).toMatch(/docKind: course\.docKind \?\? null/);
    expect(src).toMatch(/isOverview: course\.isOverview \?\? false/);
    expect(create).toContain("...curation");
    expect(update).toContain("...curation");
  });

  // A blocked verdict (403/timeout) must not revive a row the daily cron marked
  // dead (F8 Freshness, N8): the update's status goes through seededStatus.
  it("the seed derives an existing row's status through seededStatus", () => {
    const src = sourceOf(SEED);
    const upsert = src.slice(src.indexOf("db.course.upsert"));
    const update = upsert.slice(upsert.indexOf("update:"), upsert.indexOf("select:"));
    expect(update).toContain("...updateChecked");
    expect(update).not.toMatch(/checked \?\?/);
    expect(update).not.toMatch(/status:\s*"active"/);
    expect(src).toMatch(/seededStatus\(verdict, false\)/);
  });
});

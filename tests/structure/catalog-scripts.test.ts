/**
 * The catalog scripts keep the corpus honest: both use checkCourseLink (oEmbed
 * for videos), and the seed gates on catalogProblems before it writes anything
 * and writes the doc columns the DB CHECK `courses_doc_needs_kind` requires.
 */
import { describe, expect, it } from "vitest";
import { filesUnder, importsOf, sourceOf } from "./files";

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
    expect(src.indexOf("catalogProblems(")).toBeLessThan(src.indexOf("writeTemplates("));
  });

  // courses_doc_needs_kind: a doc row with doc_kind NULL is rejected. docKind and
  // isOverview ride in the pure row (`written`), spread into BOTH the create and
  // the update of the course upsert, so every path writes them.
  it("docKind and isOverview reach create AND update of the course upsert", () => {
    const src = sourceOf(SEED);
    const upsert = src.slice(src.indexOf("db.course.upsert"));
    const create = upsert.slice(upsert.indexOf("create:"), upsert.indexOf("update:"));
    const update = upsert.slice(upsert.indexOf("update:"), upsert.indexOf("select:"));
    expect(create).toContain("...written");
    expect(update).toContain("...written");
    expect(src).toContain("catalogSeedRows(");
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

  // --skip-link-check proved nothing, so an update must not stamp verified_at.
  it("the update path stamps verifiedAt only through stampsVerifiedAt", () => {
    const src = sourceOf(SEED);
    const upsert = src.slice(src.indexOf("db.course.upsert"));
    const update = upsert.slice(upsert.indexOf("update:"), upsert.indexOf("select:"));
    expect(update).toContain("...updateVerified");
    expect(update).not.toMatch(/verifiedAt/);
    expect(src).toMatch(/const updateVerified = stampsVerifiedAt\(verdict, false\) \? \{ verifiedAt: today \} : \{\};/);
  });

  it("nothing under scripts/deploy loads .env.local", () => {
    const offenders = filesUnder("scripts/deploy").filter((f) => importsOf(f).some((s) => /(^|\/)env(\.ts)?$|^dotenv(\/|$)/.test(s)));
    expect(offenders).toEqual([]);
  });
});

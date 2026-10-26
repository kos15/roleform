/**
 * The repo's shape (CLAUDE.md §10). Each test names a folder rule; moving a
 * file to the wrong place, or importing across a boundary, fails here.
 */
import { describe, expect, it } from "vitest";
import { APP_SOURCES, entriesOf, filesUnder, importsOf } from "./files";

describe("lib/ai", () => {
  it("@ai-sdk/openai is imported only under lib/ai/openai", () => {
    const offenders = APP_SOURCES().filter(
      (f) => !f.startsWith("lib/ai/openai/") && !f.startsWith("tests/") && importsOf(f).some((s) => s.startsWith("@ai-sdk/openai")),
    );
    expect(offenders).toEqual([]);
  });

  it("has no loose files — every module sits in its role folder", () => {
    expect(entriesOf("lib/ai").filter((e) => !e.isDir).map((e) => e.name)).toEqual([]);
  });
});

describe("lib/domain", () => {
  // lib/ai/schemas is pure Zod — the contract, not a model call — so domain may read its types.
  it("imports no I/O layer", () => {
    const offenders = filesUnder("lib/domain").flatMap((f) =>
      importsOf(f)
        .filter((s) => !s.includes("ai/schemas/"))
        .filter((s) => /lib\/(db|ai|supabase|services)\b|^next(\/|$)/.test(s) || /^\.\.\/(db|ai|supabase|services)\b/.test(s))
        .map((s) => `${f} → ${s}`),
    );
    expect(offenders).toEqual([]);
  });
});

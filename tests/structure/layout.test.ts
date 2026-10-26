/**
 * The repo's shape (CLAUDE.md §10). Each test names a folder rule; moving a
 * file to the wrong place, or importing across a boundary, fails here.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_SOURCES, ROOT, entriesOf, filesUnder, importsOf, sourceOf, valueImportsOf } from "./files";

describe("lib/ai", () => {
  it("@ai-sdk/openai is imported only under lib/ai/openai", () => {
    const offenders = APP_SOURCES().filter(
      (f) => !f.startsWith("lib/ai/openai/") && !f.startsWith("tests/") && importsOf(f).some((s) => s.startsWith("@ai-sdk/openai")),
    );
    expect(offenders).toEqual([]);
  });

  it("agents hold no prompt text — every context builder is imported from lib/ai/prompts", () => {
    const inline = filesUnder("lib/ai/agents").filter((f) => !f.endsWith("/define.ts") && /(static|dynamic)Context:\s*(\(|async\b|function\b|[a-z]\w*\s*=>)/.test(sourceOf(f)));
    expect(inline).toEqual([]);
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

describe("lib root", () => {
  it("holds only the agreed folders", () => {
    const entries = entriesOf("lib");
    expect(entries.filter((e) => !e.isDir).map((e) => e.name)).toEqual([]);
    expect(entries.map((e) => e.name).sort()).toEqual(
      ["admin", "ai", "catalog", "content", "db", "domain", "drill", "generated", "render", "seo", "services", "shared", "supabase"].sort(),
    );
  });
});

describe("client boundary", () => {
  it("no client file reaches the service-role client or the database", () => {
    const clientFiles = APP_SOURCES().filter((f) => /^\s*["']use client["']/.test(sourceOf(f)));
    const offenders = clientFiles.flatMap((f) =>
      valueImportsOf(f)
        .filter((s) => /lib\/supabase\/admin|lib\/db(\/|$)|\/db\/(index|queries)/.test(s))
        .map((s) => `${f} → ${s}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe("scripts", () => {
  it("every package.json script path exists", () => {
    const pkg = JSON.parse(sourceOf("package.json")) as { scripts: Record<string, string> };
    const missing = Object.entries(pkg.scripts).flatMap(([name, cmd]) =>
      [...cmd.matchAll(/scripts\/[\w/.-]+\.ts/g)].map((m) => m[0]).filter((p) => !existsSync(join(ROOT, p))).map((p) => `${name} → ${p}`),
    );
    expect(missing).toEqual([]);
  });

  it("the root holds only role folders and the two shared helpers", () => {
    const loose = entriesOf("scripts").filter((e) => !e.isDir).map((e) => e.name).sort();
    expect(loose).toEqual(["env.ts", "server-only-stub.ts"]);
    expect(entriesOf("scripts").filter((e) => e.isDir).map((e) => e.name).sort()).toEqual(["catalog", "db", "deploy", "evals", "ops", "tools"]);
  });
});

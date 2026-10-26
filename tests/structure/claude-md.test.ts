/**
 * CLAUDE.md is the contract agents read first, so a path it names that is not
 * on disk is a bug (§15.7, "docs drift is a bug"). Checks every backticked
 * repo path, and every folder or file in the §10 layout tree.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, sourceOf } from "./files";

const doc = sourceOf("CLAUDE.md");
const exists = (p: string) => ["", ".ts", ".tsx"].some((ext) => existsSync(join(ROOT, p.replace(/#.*$/, "") + ext)));

/** The §10 code block, as `root/child/...` paths, from its two-space indentation. */
function layoutPaths(): string[] {
  const section = doc.slice(doc.indexOf("## 10."), doc.indexOf("## 11."));
  const block = section.slice(section.indexOf("```") + 3, section.lastIndexOf("```")).trim();
  const stack: string[] = [];
  const out: string[] = [];
  for (const line of block.split("\n")) {
    const m = line.match(/^( *)([\w.()[\]-]+\/?)(?:\s|$)/);
    if (!m || line.trim().startsWith("+") || line.trim().startsWith("·")) continue;
    const depth = m[1].length / 2;
    if (!Number.isInteger(depth)) continue;
    stack.length = depth;
    const path = [...stack, m[2].replace(/\/$/, "")].join("/");
    out.push(path);
    if (m[2].endsWith("/")) stack.push(m[2].replace(/\/$/, ""));
  }
  return out;
}

describe("CLAUDE.md", () => {
  it("every backticked repo path exists", () => {
    const paths = [...doc.matchAll(/`((?:lib|app|scripts|tests|docs|prisma|components|public)\/[^`*{}\s]+)`/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(5);
    expect(paths.filter((p) => !exists(p))).toEqual([]);
  });

  it("every entry in the §10 layout tree exists", () => {
    const paths = layoutPaths();
    expect(paths.length).toBeGreaterThan(20);
    expect(paths.filter((p) => !exists(p))).toEqual([]);
  });

  it("product docs live under docs/product", () => {
    expect(existsSync(join(ROOT, "docs/product/specs.md"))).toBe(true);
  });
});

describe("runbook commands", () => {
  it("every `pnpm <script>` named in README.md and CLAUDE.md exists in package.json", () => {
    const pkg = JSON.parse(sourceOf("package.json")) as { scripts: Record<string, string> };
    const builtins = new Set(["install", "add", "exec", "dlx", "vitest", "prisma", "tsc"]);
    const named = ["README.md", "CLAUDE.md"].flatMap((f) => [...sourceOf(f).matchAll(/\bpnpm ([a-z][\w:-]*)/g)].map((m) => m[1]));
    expect(named.filter((n) => !builtins.has(n) && !(n in pkg.scripts))).toEqual([]);
  });
});

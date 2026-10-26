/**
 * The agent team (CLAUDE.md §16). Each role runs on the model its job needs —
 * the cost model depends on the coder being Sonnet and the curator Haiku — and
 * each holds only the tools its role allows: the reviewer and the planners
 * never edit, the coder never touches git history.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, sourceOf } from "./files";

const TEAM = {
  ino: { model: "haiku", role: "prompt curator" },
  hokage: { model: "opus", role: "architect" },
  shikamaru: { model: "opus", role: "planner" },
  kakashi: { model: "sonnet", role: "coder" },
  neji: { model: "opus", role: "reviewer" },
  jiraiya: { model: "sonnet", role: "git" },
} as const;

function frontmatter(name: string): Record<string, string> {
  const src = sourceOf(`.claude/agents/${name}.md`);
  const block = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (!block) throw new Error(`${name}.md has no frontmatter`);
  return Object.fromEntries(
    block[1]
      .split("\n")
      .map((l) => l.match(/^(\w+):\s*(.*)$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => [m[1], m[2].trim()]),
  );
}

describe("agent team", () => {
  for (const [name, spec] of Object.entries(TEAM)) {
    it(`${name} (${spec.role}) exists, is named for its file, and runs on ${spec.model}`, () => {
      expect(existsSync(join(ROOT, `.claude/agents/${name}.md`))).toBe(true);
      const fm = frontmatter(name);
      expect(fm.name).toBe(name);
      expect(fm.model).toBe(spec.model);
      expect(fm.description?.length ?? 0).toBeGreaterThan(40);
    });
  }

  it("hokage thinks at high effort", () => {
    expect(frontmatter("hokage").effort).toBe("high");
  });

  it("the reviewer, the planners and the curator cannot edit files", () => {
    for (const name of ["neji", "shikamaru", "hokage", "ino"]) {
      expect(frontmatter(name).tools ?? "", name).not.toMatch(/\b(Edit|Write)\b/);
      expect(frontmatter(name).tools, `${name} must declare its tools`).toBeTruthy();
    }
  });

  it("CLAUDE.md introduces every agent by name", () => {
    const doc = sourceOf("CLAUDE.md");
    for (const name of Object.keys(TEAM)) expect(doc, name).toContain(`\`${name}\``);
  });
});

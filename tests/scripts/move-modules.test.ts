import { describe, expect, it } from "vitest";
import { rewriteSource, rewriteSpecifier, strayPathLiterals, type MoveMap } from "@/scripts/tools/move-modules";

const exists = (p: string) =>
  new Set([
    "lib/ai/models.ts",
    "lib/ai/checkers/jev.ts",
    "lib/ai/checkers/injection.ts",
    "lib/ai/agents/define.ts",
    "lib/ai/prompts/index.ts",
    "lib/domain/lanes.ts",
  ]).has(p);

const AI: MoveMap = {
  "lib/ai/models": "lib/ai/openai/models",
  "lib/ai/checkers/": "lib/ai/typesafe/",
};

describe("rewriteSpecifier", () => {
  it("rewrites an @/ alias to a moved file", () => {
    expect(rewriteSpecifier("app/page.tsx", "app/page.tsx", "@/lib/ai/models", AI, exists)).toBe("@/lib/ai/openai/models");
  });
  it("recomputes a relative import from an unmoved importer", () => {
    expect(rewriteSpecifier("lib/ai/agents/define.ts", "lib/ai/agents/define.ts", "../models", AI, exists)).toBe("../openai/models");
  });
  it("leaves a relative import alone when importer and target move together", () => {
    expect(
      rewriteSpecifier("lib/ai/checkers/injection.ts", "lib/ai/typesafe/injection.ts", "./jev", AI, exists),
    ).toBeNull();
  });
  it("follows a directory-prefix move", () => {
    expect(rewriteSpecifier("lib/ai/agents/define.ts", "lib/ai/agents/define.ts", "../checkers/injection", AI, exists)).toBe(
      "../typesafe/injection",
    );
  });
  it("recomputes from the importer's new path when only the importer moves", () => {
    expect(rewriteSpecifier("scripts/x.ts", "scripts/ops/x.ts", "../lib/domain/lanes", {}, exists)).toBe("../../lib/domain/lanes");
  });
  it("keeps a directory import a directory import", () => {
    const map = { "lib/ai/prompts/index": "lib/ai/system-prompts/index" };
    expect(rewriteSpecifier("app/a.ts", "app/a.ts", "@/lib/ai/prompts", map, exists)).toBe("@/lib/ai/system-prompts");
  });
  it("ignores packages and generated code", () => {
    for (const spec of ["react", "@prisma/adapter-pg", "@/lib/generated/prisma/client"]) {
      expect(rewriteSpecifier("app/a.ts", "app/a.ts", spec, AI, exists)).toBeNull();
    }
  });
  it("keeps the ./ prefix on a same-directory result", () => {
    expect(rewriteSpecifier("lib/ai/openai/run.ts", "lib/ai/openai/run.ts", "../models", AI, exists)).toBe("./models");
  });
});

describe("rewriteSource", () => {
  it("rewrites every import form and leaves plain strings alone", () => {
    const src = [
      `import { a } from "x";`,
      `import type { B } from "x";`,
      `export { c } from "x";`,
      `export * from "x";`,
      `import "x";`,
      `const m = await import("x");`,
      `vi.mock("x");`,
      `const path = "x";`,
    ].join("\n");
    const out = rewriteSource(src, (s) => (s === "x" ? "y" : null));
    expect(out.split("\n")).toEqual([
      `import { a } from "y";`,
      `import type { B } from "y";`,
      `export { c } from "y";`,
      `export * from "y";`,
      `import "y";`,
      `const m = await import("y");`,
      `vi.mock("y");`,
      `const path = "x";`,
    ]);
  });
  it("rewrites a multi-line import", () => {
    expect(rewriteSource(`import {\n  a,\n  b,\n} from "x";`, () => "y")).toBe(`import {\n  a,\n  b,\n} from "y";`);
  });
});

describe("strayPathLiterals", () => {
  it("reports a path literal that names a moved module", () => {
    expect(strayPathLiterals(`readdirSync("lib/ai/checkers")`, AI)).toEqual(["lib/ai/checkers"]);
  });
  it("reports nothing for unrelated literals", () => {
    expect(strayPathLiterals(`const a = "lib/domain"`, AI)).toEqual([]);
  });
});

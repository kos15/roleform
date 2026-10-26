/**
 * Counts-only pricing gate (docs/superpowers/specs/2026-10-21-pricing-without-tokens-design.md §6):
 * no member-facing text says "token". Parses every file with the TypeScript
 * compiler and checks only what a member can read — JSX text and string or
 * template literals — never comments, identifiers or import paths.
 *
 * Admin surfaces and API routes keep tokens (operators need cost).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
const SCAN = ["app", "components", "lib/content", "lib/seo", "lib/services/auth.ts"];
const SKIP = [/^app\/\(app\)\/admin\//, /^app\/actions\/admin/, /^app\/api\//];
const WORD = /\btokens?\b/i;

function files(path: string): string[] {
  const abs = join(ROOT, path);
  if (statSync(abs).isFile()) return [path];
  return readdirSync(abs).flatMap((name) => files(join(path, name)));
}

it("no member-facing copy mentions tokens", () => {
  const hits: string[] = [];
  for (const file of SCAN.flatMap(files)) {
    if (!/\.(ts|tsx)$/.test(file) || SKIP.some((re) => re.test(file))) continue;
    const text = readFileSync(join(ROOT, file), "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node: ts.Node) => {
      const isImportPath = ts.isImportDeclaration(node.parent ?? node) || ts.isExportDeclaration(node.parent ?? node);
      const literal =
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node) ||
        ts.isJsxText(node);
      if (literal && !isImportPath && WORD.test(node.getText(source))) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        hits.push(`${relative(ROOT, join(ROOT, file))}:${line + 1}  ${node.getText(source).trim().slice(0, 90)}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(hits).toEqual([]);
});

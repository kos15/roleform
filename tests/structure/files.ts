/**
 * Repo-walking helpers for the structure tests. Paths are repo-relative.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(__dirname, "../..");
const SKIP_DIRS = new Set(["node_modules", ".next", "generated", ".git", ".superpowers"]);

/** Every .ts/.tsx/.mjs file under `dir`, skipping node_modules and generated code. */
export function filesUnder(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (statSync(abs).isFile()) return [dir];
  return readdirSync(abs).flatMap((name) => {
    if (SKIP_DIRS.has(name)) return [];
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) return filesUnder(rel);
    return /\.(ts|tsx|mjs)$/.test(name) ? [rel] : [];
  });
}

export function sourceOf(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

/** Every module specifier a file names: static, type-only, re-export, side-effect, dynamic and require() imports. */
export function importsOf(file: string): string[] {
  const src = sourceOf(file);
  const forms = [/\bfrom\s*["']([^"'\n]+)["']/g, /\bimport\s*["']([^"'\n]+)["']/g, /\bimport\s*\(\s*["']([^"'\n]+)["']/g, /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g];
  return forms.flatMap((re) => [...src.matchAll(re)].map((m) => m[1]));
}

/** Like importsOf, minus `import type` / `export type` statements, which erase at build time. */
export function valueImportsOf(file: string): string[] {
  const src = sourceOf(file).replace(/^\s*(import|export)\s+type\b[^;]*;/gm, "");
  const forms = [/\bfrom\s*["']([^"'\n]+)["']/g, /\bimport\s*["']([^"'\n]+)["']/g, /\bimport\s*\(\s*["']([^"'\n]+)["']/g, /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g];
  return forms.flatMap((re) => [...src.matchAll(re)].map((m) => m[1]));
}

export const APP_SOURCES = () => ["app", "components", "lib", "scripts", "tests", "middleware.ts"].flatMap(filesUnder);

/** Entries of a directory, ignoring OS litter. */
export function entriesOf(dir: string): { name: string; isDir: boolean }[] {
  return readdirSync(join(ROOT, dir))
    .filter((n) => n !== ".DS_Store")
    .map((name) => ({ name, isDir: statSync(join(ROOT, dir, name)).isDirectory() }));
}

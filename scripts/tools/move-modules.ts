/**
 * Moves modules and rewrites every import that names them.
 *
 *   pnpm move scripts/tools/maps/<map>.json [--dry]
 *
 * A map is `{ "<old>": "<new>" }`, repo-relative. A key without a trailing
 * slash is one module, extension-less (`"lib/ai/models"`); a key ending in `/`
 * moves a whole directory (`"lib/ai/checkers/": "lib/ai/typesafe/"`).
 *
 * Every `.ts/.tsx/.mjs` file under app, components, lib, scripts, tests and
 * middleware.ts is rewritten: `@/` specifiers stay `@/`, relative ones are
 * recomputed from the importer's new home. `lib/generated` is never touched.
 * String literals that still name a moved path (a `readdirSync` root, say)
 * are printed, not edited — those need a person. The run exits 1 if any
 * specifier that resolved before the move no longer does.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { posix } from "node:path";

export type MoveMap = Record<string, string>;

const MODULE_EXTS = [".ts", ".tsx", ".mjs", ".js"];
const SPECIFIER_FORMS = [
  /(\bfrom\s*)(["'])([^"'\n]+)\2/g,
  /(\bimport\s*)(["'])([^"'\n]+)\2/g,
  /(\bimport\s*\(\s*)(["'])([^"'\n]+)\2/g,
  /(\bvi\.mock\s*\(\s*)(["'])([^"'\n]+)\2/g,
];

/** Where a repo-relative path (with or without extension) lands under the map. */
export function applyMoves(path: string, moves: MoveMap): string {
  const ext = MODULE_EXTS.find((e) => path.endsWith(e)) ?? "";
  const id = ext ? path.slice(0, -ext.length) : path;
  if (moves[id] !== undefined && !id.endsWith("/")) return moves[id] + ext;
  for (const [from, to] of Object.entries(moves)) {
    if (from.endsWith("/") && path.startsWith(from)) return to + path.slice(from.length);
  }
  return path;
}

/** The file a specifier names, as it exists before the move, or null. */
function resolve(importer: string, spec: string, exists: (p: string) => boolean): { file: string; dirIndex: boolean; explicitExt: boolean } | null {
  let rel: string;
  if (spec.startsWith("@/")) rel = spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) rel = posix.normalize(posix.join(posix.dirname(importer), spec));
  else return null;
  if (rel.startsWith("lib/generated")) return null;
  if (exists(rel)) return { file: rel, dirIndex: false, explicitExt: true };
  for (const ext of MODULE_EXTS) if (exists(rel + ext)) return { file: rel + ext, dirIndex: false, explicitExt: false };
  for (const ext of MODULE_EXTS) if (exists(`${rel}/index${ext}`)) return { file: `${rel}/index${ext}`, dirIndex: true, explicitExt: false };
  return null;
}

function stripExt(path: string): string {
  const ext = MODULE_EXTS.find((e) => path.endsWith(e));
  return ext ? path.slice(0, -ext.length) : path;
}

/** The specifier `importerNew` should use after the move, or null if unchanged. */
export function rewriteSpecifier(
  importerOld: string,
  importerNew: string,
  spec: string,
  moves: MoveMap,
  exists: (p: string) => boolean,
): string | null {
  const target = resolve(importerOld, spec, exists);
  if (!target) return null;
  const moved = applyMoves(target.file, moves);
  let id = target.explicitExt ? moved : stripExt(moved);
  if (target.dirIndex) id = id.replace(/\/index$/, "");
  let next: string;
  if (spec.startsWith("@/")) next = `@/${id}`;
  else {
    next = posix.relative(posix.dirname(importerNew), id);
    if (!next.startsWith("../")) next = `./${next}`;
  }
  return next === spec ? null : next;
}

/** Rewrites the specifier of every import, export-from, dynamic import and vi.mock. */
export function rewriteSource(src: string, rewrite: (spec: string) => string | null): string {
  let out = src;
  for (const form of SPECIFIER_FORMS) {
    out = out.replace(form, (whole, head: string, quote: string, spec: string) => {
      const next = rewrite(spec);
      return next === null ? whole : `${head}${quote}${next}${quote}`;
    });
  }
  return out;
}

/** Non-import string literals that still name a moved path. */
export function strayPathLiterals(src: string, moves: MoveMap): string[] {
  const bases = Object.keys(moves).map((k) => k.replace(/\/$/, "").replace(/\/index$/, ""));
  const hits: string[] = [];
  for (const m of src.matchAll(/(["'`])([^"'`\n]*)\1/g)) {
    const lit = m[2];
    if (lit.startsWith("@/") || lit.startsWith("./") || lit.startsWith("../")) continue;
    if (bases.some((b) => lit === b || lit.startsWith(`${b}/`) || lit.startsWith(`${b}.`))) hits.push(lit);
  }
  return hits;
}

function specifiers(src: string): string[] {
  return SPECIFIER_FORMS.flatMap((form) => [...src.matchAll(form)].map((m) => m[3]));
}

function isTracked(file: string): boolean {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", file], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const [mapPath, flag] = process.argv.slice(2);
  if (!mapPath) throw new Error("usage: pnpm move <map.json> [--dry]");
  const dry = flag === "--dry";
  const moves: MoveMap = JSON.parse(readFileSync(mapPath, "utf8"));

  const all = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  const before = new Set(all);
  const renamed = new Map(all.map((f) => [f, applyMoves(f, moves)]));
  const after = new Set(renamed.values());
  const sources = all.filter(
    (f) =>
      /\.(ts|tsx|mjs)$/.test(f) &&
      !f.startsWith("lib/generated/") &&
      (/^(app|components|lib|scripts|tests)\//.test(f) || f === "middleware.ts"),
  );

  let broken = 0;
  let changed = 0;
  for (const file of sources) {
    const next = renamed.get(file)!;
    const src = readFileSync(file, "utf8");
    const out = rewriteSource(src, (spec) => rewriteSpecifier(file, next, spec, moves, (p) => before.has(p)));
    for (const spec of specifiers(src)) {
      const was = resolve(file, spec, (p) => before.has(p));
      if (!was) continue;
      const nowSpec = rewriteSpecifier(file, next, spec, moves, (p) => before.has(p)) ?? spec;
      if (!resolve(next, nowSpec, (p) => after.has(p))) {
        broken++;
        console.error(`unresolved after move: ${next} → ${nowSpec}`);
      }
    }
    for (const lit of strayPathLiterals(src, moves)) console.warn(`stray path literal: ${file}  "${lit}"`);
    if (out !== src) {
      changed++;
      if (!dry) writeFileSync(file, out);
    }
  }

  const moving = [...renamed].filter(([from, to]) => from !== to);
  for (const [from, to] of moving) {
    if (dry) continue;
    mkdirSync(posix.dirname(to), { recursive: true });
    if (before.has(from) && isTracked(from)) execFileSync("git", ["mv", from, to]);
    else renameSync(from, to);
  }
  console.log(`${dry ? "[dry] " : ""}${moving.length} file(s) moved, ${changed} file(s) rewritten, ${broken} unresolved`);
  if (broken > 0) process.exit(1);
}

if (typeof require !== "undefined" && require.main === module) main();

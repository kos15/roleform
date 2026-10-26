# Deploy-time Schedule + Catalog Sync Implementation Plan

> Decision by `hokage` (user-approved 2026-10-26: link-check new URLs at build; new rule N25; a failed
> schedule fails the deploy; APP_URL set in Vercel Production). Planned by `shikamaru`. Executed per
> task by `kakashi`, reviewed by `neji`, committed by `jiraiya` (CLAUDE.md §16).
> Decision record: `.superpowers/agents/hokage-deploy-time-sync.md` (local).

**Goal:** Production builds sync the pg_cron schedule and the catalog (templates, skills, courses,
course_skills, bundles) plus a `catalog_syncs` hash row by themselves. Any failure fails the deploy.
Preview and local builds log one skip line and exit 0.

**Build order:** `prisma migrate deploy && pnpm db:policies && pnpm deploy:catalog && next build --turbopack && pnpm deploy:schedule`

**Architecture:** `scripts/deploy/{catalog,schedule}.ts` are thin entries: `isProductionBuild()` first,
then `await import` the worker. `syncCatalog(deps)` in `scripts/deploy/catalog-sync.ts` holds the flow
with store, lock, link check, rebuild and clock injected (unit-tested, no DB); I/O in
`scripts/deploy/catalog-store.ts`. `lib/catalog/seed-rows.ts` is the one pure source of rows for both
the manual seed and the deploy sync; its hash decides whether the sync runs.

## Global constraints

- N8/N24: every inserted URL link-checked; `CRON_JOBS` unchanged. N10: `catalog_syncs` RLS on, FORCE, no policy.
- N12/N13: no model call; `ai_runs` unchanged. N7: logs carry counts, hash, schedule target (a dead/blocked catalog URL may print).
- §10: only pure `lib/catalog/seed-rows.ts` and one pure fn in `lib/domain/catalog-refresh.ts` go into `lib/`.
- §11: test-first. §13: vocabulary gains `CatalogSync`; CHECKs hand-added to the migration.
- Every task ends green: `pnpm test` (baseline 25 files / 287), `pnpm -s typecheck`, `pnpm exec tsc -p tsconfig.scripts.json --noEmit` (only the 3 pre-existing errors: lib/services/extract/text.ts ×2, scripts/ops/app-icons.ts).
- NEVER run `pnpm build`, `migrate dev`, `migrate deploy`, `db push`, `db execute`, the seed, or any deploy step against a database. Prisma CLI needs Node ≥ 20.19: run it as `PATH="$HOME/.nvm/versions/node/v22.14.0/bin:$PATH" ./node_modules/.bin/prisma …`.

## Rulings

1. `CatalogSync.id` uses the house style `String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid` (every other model does); the migration column is `"id" UUID NOT NULL DEFAULT gen_random_uuid()`. Main session ruling — hokage's `uuid()` was not a deliberate choice, and the migration is permanent.
2. The advisory lock runs on its own `postgres(DIRECT_URL, { max: 1 })` session, not through Prisma: `DATABASE_URL` is the pgbouncer transaction pooler, where a session lock can leak or unlock on another backend. `DIRECT_URL` is required on this path.
3. Unknown skill names fail the deploy path before any write (manual seed unchanged: skips and exits 1 at the end).
4. Template rows carry only the six written fields; `rateAts(structuralFlags)` is derived at read time — `ats-rules.ts` logic changes need no re-seed.
5. Rows seeded before the lanes migration keep their shared `checked_at`; the deploy sync never touches `checkedAt` on existing rows. The cron's 150-row cap absorbs it.
6. Migration SQL via `prisma migrate diff --from-schema <HEAD schema copy> --to-schema prisma/schema.prisma --script` (needs no DB; `--from-migrations` needs a shadow DB).
7. Vercel exposes system env vars at build (VERCEL_ENV, VERCEL_GIT_COMMIT_SHA appeared in `vercel env pull`), so the gate sees production.
8. (neji, Task 1) Every env parameter in this plan is `Partial<NodeJS.ProcessEnv>` (`isProductionBuild`, `skipLine`, `runCatalogDeploy`, `deploySchedule`) — tests pass plain literals, no casts.
9. (neji, Task 1) Deploy worker modules import only modules with NO top-level `import "../env"`: take `rebuildBundles` from `lib/services/learning/rebuild-bundles.ts` and `checkCourseLink` from `lib/catalog/liveness.ts` — never from `scripts/catalog/rebuild-bundles.ts` or `scripts/catalog/link-check.ts` (both load `.env.local`). Task 4 extends the no-env structure test to `scripts/deploy/catalog-store.ts`'s and `scripts/deploy/catalog-sync.ts`'s relative `scripts/…` imports.

---

### Task 1: The production gate

**Files:** Create `scripts/deploy/gate.ts`, `tests/scripts/deploy-gate.test.ts`. Modify `tests/structure/layout.test.ts` (scripts root dir list → `["catalog", "db", "deploy", "evals", "ops", "tools"]`), `tests/structure/catalog-scripts.test.ts`, `CLAUDE.md` §10 tree (under `scripts/`, after `catalog/`, same two-space indent: `  deploy/                    production-build steps: catalog sync, schedule (N25) — gated on VERCEL_ENV`).

**Produces:**
```ts
export function isProductionBuild(env: NodeJS.ProcessEnv = process.env): boolean; // env.VERCEL_ENV === "production", exact
export function skipLine(name: "catalog" | "schedule", env: NodeJS.ProcessEnv = process.env): string;
// `[deploy:${name}] skipped (VERCEL_ENV=${env.VERCEL_ENV || "unset"})`
```
`gate.ts` has NO imports; header explains why it must not import `../env` (`vercel env pull --environment=production` writes VERCEL_ENV into .env.local).

- [ ] Step 1 — failing tests. `tests/scripts/deploy-gate.test.ts`:
```ts
import { isProductionBuild, skipLine } from "@/scripts/deploy/gate";
it("production → true", () => expect(isProductionBuild({ VERCEL_ENV: "production" })).toBe(true));
it.each(["preview", "development", "Production", " production", ""])("%j → false", (v) => expect(isProductionBuild({ VERCEL_ENV: v })).toBe(false));
it("unset → false", () => expect(isProductionBuild({})).toBe(false));
it("skip line names the step and the value", () => {
  expect(skipLine("catalog", {})).toBe("[deploy:catalog] skipped (VERCEL_ENV=unset)");
  expect(skipLine("schedule", { VERCEL_ENV: "preview" })).toBe("[deploy:schedule] skipped (VERCEL_ENV=preview)");
});
```
In `catalog-scripts.test.ts` (import `filesUnder`, `importsOf` from `./files`):
```ts
it("nothing under scripts/deploy loads .env.local", () => {
  const offenders = filesUnder("scripts/deploy").filter((f) => importsOf(f).some((s) => /(^|\/)env$/.test(s)));
  expect(offenders).toEqual([]);
});
```
- [ ] Step 2 — `pnpm vitest run tests/scripts/deploy-gate.test.ts tests/structure` → FAIL (unresolved `@/scripts/deploy/gate`; ENOENT on `scripts/deploy`).
- [ ] Step 3 — implement gate.ts; layout test + CLAUDE.md §10 edits.
- [ ] Step 4 — PASS; three green commands.
- [ ] Step 5 (jiraiya) — `feat(deploy): VERCEL_ENV production gate for build-time steps`. Revert-note: removes an unused helper; nothing calls it yet.

### Task 2: Pure seed rows + hash; manual seed writes from them

**Files:** Create `lib/catalog/seed-rows.ts`, `scripts/catalog/catalog-writes.ts`, `tests/catalog/seed-rows.test.ts`. Modify `lib/domain/catalog-refresh.ts`, `scripts/catalog/seed-catalog.ts`, `tests/domain/catalog-refresh.test.ts`, `tests/structure/catalog-scripts.test.ts`.

**Produces `lib/catalog/seed-rows.ts`** (pure; imports only node:crypto, ./courses, ./skills, ./taxonomy, ./quality, ../render/templates):
```ts
export const SEED_FORMAT = 1; // bump by hand when seed/bundle logic changes in a way rows don't show (bundle-rank.ts, QUALITY_FLOOR in rebuild-bundles.ts, write rules)
export interface TemplateRow { id: string; name: string; kind: TemplateKind; blurb: string; accent: string; structuralFlags: StructuralFlags }
export interface SkillRow { name: string; category: SkillDef["category"]; aliases: string[]; slug: string; roadmapPath: string | null; depth: number; volatility: Volatility; parent: string | null }
export interface CourseRow { url: string; provider: string; title: string; priceLabel: string; lengthLabel: string; lengthMinutes: number; level: CourseDef["level"]; mark: string; isFree: boolean;
  skills: string[];            // canonical names in authored order; written as skillIds
  type: ResourceType; qualityScore: string /* qualityOf().toFixed(3) */; tags: string[]; docKind: "official" | "tutorial" | null; isOverview: boolean }
export interface CourseSkillRow { courseUrl: string; skillName: string; level: "intro" | "working" | "deep"; confidence: string /* toFixed(3) */; isPrimary: boolean; summary: string }
export interface CatalogSeedRows { templates: TemplateRow[]; skills: SkillRow[]; courses: CourseRow[]; courseSkills: CourseSkillRow[] }
export interface CatalogSource { templates: TemplateDef[]; skills: SkillDef[]; courses: CourseDef[] }
export function catalogSeedRows(src?: CatalogSource): CatalogSeedRows; // default { TEMPLATES, SKILLS, COURSES }; skill node from NODES.get(name) — throw Error(`no taxonomy node for ${name}`) if absent
export function catalogHash(rows: CatalogSeedRows, format: number = SEED_FORMAT): string; // sha256 hex of stableJson({ format, rows }); stableJson sorts object keys recursively, keeps array order (private)
export function unknownSkillNames(rows: CatalogSeedRows): string[]; // course skill names absent from rows.skills, deduped, first-seen order
```
Row order = source order (`courses[i]` is `COURSES[i]` — the stagger index depends on it); `courseSkills` flattened course by course in each course's skill order; rows carry no `id`, `verifiedAt`, `checkedAt`, `status`.

**Produces `scripts/catalog/catalog-writes.ts`** (imports `../../lib/db`, not `../env`):
```ts
export async function writeTemplates(rows: TemplateRow[]): Promise<void>;              // upsert by id (body moved verbatim from seed)
export async function writeSkills(rows: SkillRow[]): Promise<Map<string, string>>;     // pass 1 upsert minus parent; findMany; pass 2 parentId; returns name → id
export async function writeCourseSkills(courseId: string, rows: CourseSkillRow[], skillIdByName: Map<string, string>): Promise<number>; // upsert per (courseId, skillId); entryLabel/entryUrl null; returns count
```
**Produces in `lib/domain/catalog-refresh.ts`:**
```ts
/** Does this write stamp verified_at? A new row always does (NOT NULL); an existing row only when the link was confirmed live. */
export function stampsVerifiedAt(verdict: Liveness | null, isNew: boolean): boolean;
```
- [ ] Step 1 — failing tests. `tests/catalog/seed-rows.test.ts`:
```ts
const rows = catalogSeedRows();
it("one row per source entry, in source order", () => {
  expect(rows.templates).toHaveLength(TEMPLATES.length);
  expect(rows.skills).toHaveLength(SKILLS.length);
  expect(rows.courses.map((c) => c.url)).toEqual(COURSES.map((c) => c.url));
  expect(rows.courseSkills).toHaveLength(COURSES.reduce((n, c) => n + c.skills.length, 0));
});
it("the first course is written exactly as the seed writes it", () => {
  expect(rows.courses[0]).toEqual({ url: "https://roadmap.sh/frontend", provider: "roadmap.sh", title: "Frontend Developer Roadmap",
    priceLabel: "Free", lengthLabel: "Self-paced", lengthMinutes: 600, level: "beginner", mark: "RS", isFree: true,
    skills: ["HTML", "CSS", "JavaScript"], type: "roadmap", qualityScore: "0.873", tags: ["html", "css", "javascript"],
    docKind: null, isOverview: false });
  expect(rows.courseSkills.slice(0, 2)).toEqual([
    { courseUrl: "https://roadmap.sh/frontend", skillName: "HTML", level: "intro", confidence: "1.000", isPrimary: true, summary: "Introduces HTML from scratch" },
    { courseUrl: "https://roadmap.sh/frontend", skillName: "CSS", level: "intro", confidence: "0.600", isPrimary: false, summary: "Covers CSS as part of HTML" },
  ]);
});
it("qualityScore is derived, not authored", () => {
  rows.courses.forEach((r, i) => expect(r.qualityScore).toBe(qualityOf(COURSES[i]).toFixed(3)));
});
it("a doc row carries its docKind", () => {
  const i = COURSES.findIndex((c) => c.docKind === "official");
  expect(rows.courses[i].docKind).toBe("official");
});
it("skills carry taxonomy depth and parent by name", () => {
  expect(rows.skills.find((s) => s.name === "Next.js")).toMatchObject({ parent: "React", depth: 2, slug: "next-js" });
  expect(rows.skills.find((s) => s.name === "JavaScript")).toMatchObject({ parent: null, depth: 0 });
});
it("templates carry only the written fields", () => {
  expect(Object.keys(rows.templates[0]).sort()).toEqual(["accent", "blurb", "id", "kind", "name", "structuralFlags"]);
});
it("no row carries a stamp, status or id", () => {
  for (const r of rows.courses) for (const k of ["verifiedAt", "checkedAt", "status", "id", "skillIds"]) expect(k in r).toBe(false);
});
it("hash: 64 hex, stable across calls and key order", () => {
  const h = catalogHash(rows);
  expect(h).toMatch(/^[0-9a-f]{64}$/);
  expect(catalogHash(catalogSeedRows())).toBe(h);
  const reordered = JSON.parse(JSON.stringify(rows, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v)));
  expect(catalogHash(reordered)).toBe(h);
});
it("hash moves with a derived field and with SEED_FORMAT", () => {
  const changed = structuredClone(rows); changed.courses[0].qualityScore = "0.001";
  expect(catalogHash(changed)).not.toBe(catalogHash(rows));
  expect(catalogHash(rows, SEED_FORMAT + 1)).not.toBe(catalogHash(rows));
});
it("unknownSkillNames finds a typo'd skill", () => {
  expect(unknownSkillNames(rows)).toEqual([]);
  const bad = catalogSeedRows({ templates: TEMPLATES, skills: SKILLS, courses: [{ ...COURSES[0], skills: ["HTML", "Reactt"] }] });
  expect(unknownSkillNames(bad)).toEqual(["Reactt"]);
});
```
(If an exact expected value above disagrees with what today's seed writes — e.g. the first course's computed fields — the seed is the truth: report the difference, don't change the seed.)
`catalog-refresh.test.ts`: `stampsVerifiedAt` → true for `(null,true)`, `("live",true)`, `("blocked",true)`, `("live",false)`; false for `("blocked",false)`, `("dead",false)`, `(null,false)`.
`catalog-scripts.test.ts`: gate-order test's `"db.template.upsert"` → `"writeTemplates("`; replace the two docKind/isOverview tests with one — the seed's `db.course.upsert` create slice contains `"...written"`, the update slice contains `"...written"`, and the seed contains `catalogSeedRows(`; keep the seededStatus test; add: update slice does not match `/verifiedAt:\s*today/` and the seed contains `stampsVerifiedAt(verdict, false)`.
- [ ] Step 2 — run the three files → FAIL (unresolved `@/lib/catalog/seed-rows`; `stampsVerifiedAt is not a function`; structure assertions on `writeTemplates(` / `...written`).
- [ ] Step 3 — implement: seed-rows maps 1:1 from today's seed bodies; catalog-writes takes the template, skill (both passes) and course-skill loops verbatim; seed: `const rows = catalogSeedRows()`, `writeTemplates(rows.templates)` then log ATS per row via `rateAts(row.structuralFlags)`, `const skillIdByName = await writeSkills(rows.skills)` (skills log keeps "skills: N (R roots, depth D)" from rows), courses `for (const [index, course] of rows.courses.entries())` with `const { url, skills, ...written } = course;` — create = `{ url, ...written, skillIds, verifiedAt: today, ...createChecked }`, update = `{ ...written, skillIds, ...(stampsVerifiedAt(verdict, false) ? { verifiedAt: today } : {}), ...updateChecked }`; course skills via `writeCourseSkills(row.id, skillRowsByUrl.get(url) ?? [], skillIdByName)` (Map built once). Keep unknown-skill skip + exit 1, dead/blocked reporting, `--skip-link-check` (header line: "local-only — production builds never pass it (N25)"), uncovered-skills report (from `rows.courses.flatMap(c => c.skills)`). Behaviour-preserving apart from verifiedAt.
- [ ] Step 4 — PASS; three green commands.
- [ ] Step 5 (jiraiya) — strike PENDING "Seed `--skip-link-check` still stamps `verifiedAt: today`…". `refactor(catalog): seed writes from pure catalogSeedRows; verifiedAt stamped on update only when live`. Revert-note: restores inline row building and the unconditional update-path verifiedAt stamp; no schema or data-shape change.

### Task 3: `CatalogSync` model, migration, RLS

**Files:** Modify `prisma/schema.prisma`, `lib/db/policies.sql`. Create `prisma/migrations/20261026000000_catalog_syncs/migration.sql`, `tests/structure/catalog-sync-schema.test.ts`.

**Model** (after `SkillBundle`; Ruling 1 id style):
```prisma
/// One row per successful production catalog sync (N25). Append-only; written last by `pnpm deploy:catalog`.
/// CHECKs catalog_syncs_hash_hex and *_nonneg are hand-added in 20261026000000_catalog_syncs.
model CatalogSync {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  hash      String
  courses   Int
  skills    Int
  templates Int
  bundles   Int
  gitSha    String?  @map("git_sha")
  syncedAt  DateTime @default(now()) @map("synced_at") @db.Timestamptz

  @@index([syncedAt])
  @@map("catalog_syncs")
}
```
- [ ] Step 1 — failing tests `tests/structure/catalog-sync-schema.test.ts`:
```ts
const schema = sourceOf("prisma/schema.prisma");
const policies = sourceOf("lib/db/policies.sql");
const MIG = "prisma/migrations/20261026000000_catalog_syncs/migration.sql";
it("every model table has RLS in policies.sql (N10)", () => {
  const tables = [...schema.matchAll(/^model \w+ \{[\s\S]*?^\}/gm)].map((m) => /@@map\("([a-z_]+)"\)/.exec(m[0])?.[1]).filter(Boolean) as string[];
  expect(tables).toContain("catalog_syncs");
  expect(tables.filter((t) => !new RegExp(`'${t}'|public\\.${t}\\b`).test(policies))).toEqual([]);
});
it("catalog_syncs is RLS-on with no policy", () => {
  expect(policies).toMatch(/array\['catalog_syncs'\]/);
  expect(policies).not.toMatch(/create policy[^;]*on public\.catalog_syncs/i);
});
it("the migration creates the table and carries the hand-added CHECKs", () => {
  const sql = sourceOf(MIG);
  expect(sql).toContain('CREATE TABLE "catalog_syncs"');
  expect(sql).toContain(`CHECK ("hash" ~ '^[0-9a-f]{64}$')`);
  for (const c of ["courses", "skills", "templates", "bundles"]) expect(sql).toContain(`"catalog_syncs_${c}_nonneg" CHECK ("${c}" >= 0)`);
});
```
- [ ] Step 2 — run → FAIL (`to contain 'catalog_syncs'`; ENOENT on the migration).
- [ ] Step 3 — (prisma via the nvm Node 22 PATH; NEVER migrate dev/deploy, db push, db execute):
  1. add the model; 2. `prisma validate` → valid; 3. `git show HEAD:prisma/schema.prisma > <scratch>/schema.before.prisma`;
  4. `mkdir prisma/migrations/20261026000000_catalog_syncs && prisma migrate diff --from-schema <scratch>/schema.before.prisma --to-schema prisma/schema.prisma --script -o prisma/migrations/20261026000000_catalog_syncs/migration.sql` — expect exactly one `CREATE TABLE "catalog_syncs"` (id UUID default gen_random_uuid(), git_sha TEXT, synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, pkey) and `CREATE INDEX "catalog_syncs_synced_at_idx"` — anything else: STOP and report;
  5. prepend a header comment (learning_lanes style): generated by `prisma migrate diff --from-schema <HEAD schema> --to-schema prisma/schema.prisma` because there is no non-production DB and `--from-migrations` needs a shadow DB; CHECKs hand-added (CLAUDE.md §13); RLS comes from lib/db/policies.sql, applied by the next build step;
  6. append under `-- Hand-written below.`:
```sql
ALTER TABLE "catalog_syncs" ADD CONSTRAINT "catalog_syncs_hash_hex" CHECK ("hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "catalog_syncs" ADD CONSTRAINT "catalog_syncs_courses_nonneg" CHECK ("courses" >= 0);
ALTER TABLE "catalog_syncs" ADD CONSTRAINT "catalog_syncs_skills_nonneg" CHECK ("skills" >= 0);
ALTER TABLE "catalog_syncs" ADD CONSTRAINT "catalog_syncs_templates_nonneg" CHECK ("templates" >= 0);
ALTER TABLE "catalog_syncs" ADD CONSTRAINT "catalog_syncs_bundles_nonneg" CHECK ("bundles" >= 0);
```
  7. policies.sql: after the admin-controls block, a workspace_settings-style comment (build bookkeeping, written only by `pnpm deploy:catalog` over the Prisma connection, read by nothing a JWT holds → RLS on with NO policy, N10) and a block matching the existing multi-line formatting:
```sql
do $$ declare t text; begin
  foreach t in array array['catalog_syncs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists "public read" on public.%I', t);
  end loop;
end $$;
```
  8. `prisma generate` so `db.catalogSync` typechecks.
- [ ] Step 4 — PASS; three green commands.
- [ ] Step 5 (jiraiya) — `feat(db): catalog_syncs table (CatalogSync) with hash/count CHECKs and RLS on, no policy`. Revert-note: **Reverting the code does NOT drop the table.** Once any build ran `prisma migrate deploy`, `catalog_syncs` and its `_prisma_migrations` row stay; drop by hand (`DROP TABLE catalog_syncs; DELETE FROM _prisma_migrations WHERE migration_name = '20261026000000_catalog_syncs';`) or leave them. Never edit this migration after it is applied.

### Task 4: `pnpm deploy:catalog`

**Files:** Create `scripts/deploy/catalog-sync.ts` (flow; never imports lib/db), `scripts/deploy/catalog-store.ts` (Prisma + lock + wiring), `scripts/deploy/catalog.ts` (entry), `tests/scripts/catalog-sync.test.ts`. Modify `package.json` (`"deploy:catalog": "pnpm script scripts/deploy/catalog.ts"`; `build` unchanged until Task 5), `tests/structure/catalog-scripts.test.ts`.

**`scripts/deploy/catalog-sync.ts`:**
```ts
export const SYNC_CONCURRENCY = 5;
export const SYNC_LOCK_KEY = "roleform_catalog_sync";
export type CourseFields = Omit<CourseRow, "url" | "skills"> & { skillIds: string[] };
export type NewCourseData = CourseFields & { url: string; status: "active"; checkedAt: Date; verifiedAt: Date };
export interface CatalogSyncRecord { hash: string; courses: number; skills: number; templates: number; bundles: number; gitSha: string | null }
export interface CatalogStore {
  lastHash(): Promise<string | null>;
  existingUrls(): Promise<Set<string>>;
  writeTemplates(rows: TemplateRow[]): Promise<void>;
  writeSkills(rows: SkillRow[]): Promise<Map<string, string>>;
  createCourse(data: NewCourseData): Promise<string>;
  updateCourse(url: string, data: CourseFields): Promise<string>;
  writeCourseSkills(courseId: string, rows: CourseSkillRow[], skillIdByName: Map<string, string>): Promise<number>;
  record(sync: CatalogSyncRecord): Promise<void>;
}
export type SyncOutcome =
  | { kind: "gated"; problems: string[] }
  | { kind: "unchanged"; hash: string }
  | { kind: "dead"; hash: string; dead: string[] }
  | { kind: "synced"; hash: string; created: number; blocked: string[]; links: number; bundles: number; elapsedMs: number };
export interface SyncDeps {
  rows: CatalogSeedRows; store: CatalogStore;
  lock: () => Promise<() => Promise<void>>;
  check: (def: { url: string; type: ResourceType }) => Promise<LinkCheck>;
  rebuild: () => Promise<{ written: number }>;
  gates?: (rows: CatalogSeedRows) => string[];
  today: Date; clock: () => number; gitSha: string | null;
  log?: (line: string) => void; error?: (line: string) => void;
}
export function catalogGateProblems(rows: CatalogSeedRows): string[];
// [...catalogProblems(COURSES, SKILLS names), ...assertTemplates(), ...assertTaxonomy(), ...unknownSkillNames(rows).map(n => `Skill name not in the canon: ${n}`)]
export function newCourseData(row: CourseRow, index: number, skillIds: string[], today: Date): NewCourseData; // status "active", checkedAt staggeredCheckedAt(today, index), verifiedAt today
export function existingCourseData(row: CourseRow, skillIds: string[]): CourseFields;                        // no url/status/checkedAt/verifiedAt
export async function syncCatalog(deps: SyncDeps): Promise<SyncOutcome>;
```
**Flow of `syncCatalog`:** (1) `t0 = clock()`; `problems = gates(rows)`; any → `error("[deploy:catalog] catalog has problems:")` + `  - p` lines, return `gated` (no lock, no store call). (2) `hash = catalogHash(rows)`; `release = await lock()`; all later steps in `try { … } finally { await release() }`. (3) `store.lastHash() === hash` → `log(\`[deploy:catalog] unchanged ${hash.slice(0, 8)}\`)`, return `unchanged`. (4) `existing = store.existingUrls()`; fresh = `rows.courses` entries (with their original index) whose url isn't in `existing`; check with `SYNC_CONCURRENCY` workers (`next++` pattern as `refreshDueLinks`); a throw counts as blocked; collect dead/blocked as `` `${provider} — ${title} → ${url}` ``; any dead → `error` header `[deploy:catalog] ${n} new URL(s) returned 404/410 — fix lib/catalog/courses.ts:` + lines, return `dead` (nothing written). (5) writes: `writeTemplates`, `idByName = writeSkills`; per course in `rows` order: `skillIds = row.skills.map(n => idByName.get(n)!)`; fresh → `createCourse(newCourseData(row, index, skillIds, today))`, else `updateCourse(row.url, existingCourseData(row, skillIds))`; `links += writeCourseSkills(id, courseSkillsByUrl.get(url) ?? [], idByName)`. (6) `{ written } = await rebuild()`. (7) `store.record({ hash, courses: rows.courses.length, skills: rows.skills.length, templates: rows.templates.length, bundles: written, gitSha })`. (8) blocked → log `[deploy:catalog] ${n} new URL(s) refused the check and were seeded:` + lines; then log exactly `[deploy:catalog] synced ${hash8} templates=${T} skills=${S} courses=${C} new=${created} blocked=${b} links=${links} bundles=${written} in ${clock() - t0}ms`; return `synced`. Any throw from store/rebuild/record propagates after `release()` → no sync row.

**`scripts/deploy/catalog-store.ts`** (imports `../../lib/db`, `postgres`, `../catalog/catalog-writes`, `checkCourseLink`, `rebuildBundles`, `./catalog-sync`; not `../env`):
```ts
export function advisoryLock(directUrl: string | undefined): () => Promise<() => Promise<void>>;
// throws Error("DIRECT_URL is not set — the catalog lock needs a session connection, not the pgbouncer pooler") when unset;
// postgres(directUrl, { max: 1 }); `select pg_advisory_lock(hashtext(${SYNC_LOCK_KEY}))`; release = unlock then sql.end() (sql.end() runs even if unlock throws)
export const prismaCatalogStore: CatalogStore;
// lastHash: db.catalogSync.findFirst({ orderBy: { syncedAt: "desc" }, select: { hash: true } }); existingUrls: db.course.findMany({ select: { url: true } });
// writeTemplates/writeSkills/writeCourseSkills delegate to catalog-writes; createCourse: db.course.create({ data, select: { id: true } }); updateCourse: db.course.update({ where: { url }, data, select: { id: true } }); record: db.catalogSync.create
export async function runCatalogDeploy(env: NodeJS.ProcessEnv = process.env): Promise<number>;
// syncCatalog({ rows: catalogSeedRows(), store: prismaCatalogStore, lock: advisoryLock(env.DIRECT_URL), check: (def) => checkCourseLink(def),
//   rebuild: () => rebuildBundles(), today: new Date(), clock: Date.now, gitSha: env.VERCEL_GIT_COMMIT_SHA ?? null });
// finally db.$disconnect(); return outcome.kind === "gated" || outcome.kind === "dead" ? 1 : 0
```
**`scripts/deploy/catalog.ts`:** `main(): Promise<number>` — `!isProductionBuild()` → `console.log(skipLine("catalog"))`, return 0; else `const { runCatalogDeploy } = await import("./catalog-store")`, return `runCatalogDeploy()`. `main().then((c) => process.exit(c), (e) => { console.error(\`[deploy:catalog] failed: ${e instanceof Error ? e.message : String(e)}\`); process.exit(1); })`. No top-level await (scripts tsconfig is CommonJS).

- [ ] Step 1 — failing tests `tests/scripts/catalog-sync.test.ts`. Fixture `rowsWith(urls)`: one template `catalogSeedRows().templates[0]`; skills = `catalogSeedRows().skills` filtered to HTML and CSS; one course per url `{ ...catalogSeedRows().courses[0], url, skills: ["HTML"] }`; one courseSkill per url. In-memory `makeStore({ last = null, existing = [] })` of `vi.fn`s pushing their name to a shared `calls: string[]`; `createCourse`/`updateCourse` return `"id-" + url`; `writeSkills` returns `new Map([["HTML","s1"],["CSS","s2"]])`; `writeCourseSkills` returns `rows.length`. `lock = vi.fn(async () => { calls.push("lock"); return async () => { calls.push("release"); }; })`. `today = new Date("2026-10-26T00:00:00.000Z")`. Base deps: `gates: () => []`, `gitSha: "abc"`, clock yielding 1000 then 1450; spy `log`/`error`.
  - S1 gate problems: `gates: () => ["x"]` → `{ kind: "gated", problems: ["x"] }`; lock and every store fn not called.
  - S2 unchanged: `last = catalogHash(rows)` → `{ kind: "unchanged", hash }`; log called with `` `[deploy:catalog] unchanged ${hash.slice(0, 8)}` ``; `calls` equals `["lock", "lastHash", "release"]`.
  - S3 only new URLs checked: `existing = ["https://a.test/1"]`, urls 1–3 → check called with exactly urls 2 and 3; `updateCourse` called with `"https://a.test/1"`; `createCourse` called twice.
  - S4 dead new URL writes nothing: check dead for url 2 → `kind === "dead"`; `dead[0]` contains `"https://a.test/2"`; `calls` equals `["lock", "lastHash", "existingUrls", "release"]`; `record` not called.
  - S5 blocked or thrown is seeded: blocked for url 1, throw for url 2 → `synced`, `blocked` length 2.
  - S6 new-row stamps: new course at rows index 3 → `createCourse` arg `toMatchObject({ status: "active", verifiedAt: today, checkedAt: new Date("2026-10-23T00:00:00.000Z"), skillIds: ["s1"] })`; `updateCourse` data keys contain none of `status`, `checkedAt`, `verifiedAt`, `url`.
  - S7 write order (one new URL): `calls` equals `["lock", "lastHash", "existingUrls", "writeTemplates", "writeSkills", "createCourse", "writeCourseSkills", "rebuild", "record", "release"]` (rebuild fake pushes "rebuild").
  - S8 record: called with `{ hash: catalogHash(rows), courses: 1, skills: 2, templates: 1, bundles: 7, gitSha: "abc" }` when rebuild returns `{ written: 7 }`.
  - S9 summary line: log's last call equals `` `[deploy:catalog] synced ${hash.slice(0, 8)} templates=1 skills=2 courses=1 new=1 blocked=0 links=1 bundles=7 in 450ms` ``.
  - S10 rebuild throws: `syncCatalog` rejects; `record` not called; `"release"` is the last entry of `calls`.
  - S11 concurrency: 12 new URLs, check tracking in-flight (await setTimeout 1 ms) → max in-flight 5, check called 12 times.
  - Gate default: `expect(catalogGateProblems(catalogSeedRows())).toEqual([])`.
  In `catalog-scripts.test.ts`:
```ts
const deploy = () => filesUnder("scripts/deploy").map(sourceOf).join("\n");
it("deploy:catalog link-checks with checkCourseLink and rebuilds bundles", () => { expect(deploy()).toContain("checkCourseLink("); expect(deploy()).toContain("rebuildBundles("); expect(deploy()).not.toContain("checkLiveness"); });
it("the deploy path never skips the link check", () => expect(deploy()).not.toMatch(/skip-?link-?check|skipLinkCheck/i));
it("deploy entries check the gate before importing their worker", () => {
  const src = sourceOf("scripts/deploy/catalog.ts");
  expect([...src.matchAll(/\bfrom\s*["']([^"']+)["']/g)].map((m) => m[1])).toEqual(["./gate"]);
  expect(src.indexOf("isProductionBuild(")).toBeGreaterThan(-1);
  expect(src.indexOf("isProductionBuild(")).toBeLessThan(src.indexOf("await import("));
});
```
- [ ] Step 2 — run → FAIL (unresolved `@/scripts/deploy/catalog-sync`; ENOENT `scripts/deploy/catalog.ts`).
- [ ] Step 3 — implement the three files + `deploy:catalog` script.
- [ ] Step 4 — PASS; three green commands; `VERCEL_ENV= pnpm deploy:catalog` → prints `[deploy:catalog] skipped (VERCEL_ENV=unset)`, exit 0.
- [ ] Step 5 (jiraiya) — `feat(deploy): deploy:catalog syncs catalog on hash change — new URLs link-checked, bundles rebuilt, sync row last`. Revert-note: not yet in `build`; reverting removes a manual-only command; catalog_syncs rows from a manual run stay.

### Task 5: `pnpm deploy:schedule` and the build order

**Files:** Create `scripts/db/install-schedule.ts`, `scripts/deploy/schedule.ts`, `tests/scripts/install-schedule.test.ts`. Modify `scripts/db/schedule.ts`, `package.json`, `tests/structure/catalog-scripts.test.ts`.

**`scripts/db/install-schedule.ts`** (no `../env` import, no `main`):
```ts
export function scheduleTarget(appUrl: string | undefined, secret: string | undefined): { appUrl: string; secret: string };
// strips trailing "/"; throws "APP_URL must be the deployment's https:// origin" / "CRON_SECRET must be set, and at least 32 characters" (existing messages)
export async function installSchedule(sql: postgres.Sql, appUrl: string, secret: string): Promise<string[]>;
// body moved verbatim from schedule.ts (extensions, Vault create/update, per-job unschedule+schedule); returns the
// `scheduled ${name}: ${schedule} → ${appUrl}${path}` lines instead of logging them
export async function deploySchedule(env: NodeJS.ProcessEnv = process.env, connect: (url: string) => postgres.Sql = (u) => postgres(u, { max: 1 })): Promise<void>;
// db url = env.DIRECT_URL ?? env.DATABASE_URL (throw "DIRECT_URL (or DATABASE_URL) is not set");
// target = scheduleTarget(env.APP_URL, env.CRON_SECRET) — APP_URL ONLY, validated BEFORE connect;
// log `[deploy:schedule] target ${appUrl}`; sql = connect(url); try lines.forEach(l => log(`[deploy:schedule] ${l}`)) finally sql.end()
```
`schedule.ts` keeps `import "../env"`, `--remove`, its `APP_URL ?? NEXT_PUBLIC_SITE_URL` fallback; its main body becomes `scheduleTarget(...)` → `installSchedule(sql, …)` → log each line. `scripts/deploy/schedule.ts` mirrors `catalog.ts` (gate → `await import("../db/install-schedule")` → `deploySchedule()`; errors → `[deploy:schedule] failed: <message>`, exit 1). `package.json`: `"deploy:schedule": "pnpm script scripts/deploy/schedule.ts"`, `"build": "prisma migrate deploy && pnpm db:policies && pnpm deploy:catalog && next build --turbopack && pnpm deploy:schedule"`.

- [ ] Step 1 — failing tests `tests/scripts/install-schedule.test.ts`:
```ts
const S = "s".repeat(32);
it("scheduleTarget strips trailing slashes", () => expect(scheduleTarget("https://roleform.koustubh.org//", S)).toEqual({ appUrl: "https://roleform.koustubh.org", secret: S }));
it.each([undefined, "", "http://roleform.koustubh.org"])("APP_URL %j is refused", (u) => expect(() => scheduleTarget(u, S)).toThrow(/APP_URL must be/));
it("short secret is refused", () => expect(() => scheduleTarget("https://x.org", "s".repeat(31))).toThrow(/CRON_SECRET must be set/));
it("deploySchedule has no fallback to NEXT_PUBLIC_SITE_URL / VERCEL_PROJECT_PRODUCTION_URL, and refuses before connecting", async () => {
  const connect = vi.fn();
  await expect(deploySchedule({ NEXT_PUBLIC_SITE_URL: "https://x.org", VERCEL_PROJECT_PRODUCTION_URL: "x.org", CRON_SECRET: S, DIRECT_URL: "postgres://never" }, connect)).rejects.toThrow(/APP_URL must be/);
  expect(connect).not.toHaveBeenCalled();
});
it("installSchedule creates the secret and schedules every CRON_JOBS entry", async () => {
  const seen: { text: string; values: unknown[] }[] = [];
  const fake = (async (strings: TemplateStringsArray, ...values: unknown[]) => { seen.push({ text: strings.join("?"), values }); return []; }) as unknown as postgres.Sql;
  const lines = await installSchedule(fake, "https://roleform.koustubh.org", S);
  expect(seen[0].text).toContain("create extension if not exists pg_cron");
  expect(seen.find((q) => q.text.includes("vault.create_secret"))!.values).toEqual([S, CRON_SECRET_NAME]);
  for (const job of CRON_JOBS) expect(seen.find((q) => q.text.includes("cron.schedule") && q.values[0] === job.name)!.values).toEqual([job.name, job.schedule, scheduleCommand(job, "https://roleform.koustubh.org")]);
  expect(lines).toEqual(CRON_JOBS.map((j) => `scheduled ${j.name}: ${j.schedule} → https://roleform.koustubh.org${j.path}`));
});
```
In `catalog-scripts.test.ts`: extend the gate-order test to loop over `scripts/deploy/catalog.ts` and `scripts/deploy/schedule.ts`; add `scripts/db/install-schedule.ts` to the no-`../env` check; add:
```ts
it("build runs migrate → policies → catalog → next → schedule", () => {
  expect(JSON.parse(sourceOf("package.json")).scripts.build).toBe("prisma migrate deploy && pnpm db:policies && pnpm deploy:catalog && next build --turbopack && pnpm deploy:schedule");
});
```
- [ ] Step 2 — run → FAIL (unresolved `@/scripts/db/install-schedule`; build string; ENOENT `scripts/deploy/schedule.ts`).
- [ ] Step 3 — implement.
- [ ] Step 4 — PASS; three green commands; `VERCEL_ENV=preview pnpm deploy:schedule` → `[deploy:schedule] skipped (VERCEL_ENV=preview)`, exit 0. Do NOT run `pnpm build` locally.
- [ ] Step 5 (jiraiya) — `feat(deploy): production builds sync catalog and install the pg_cron schedule`. Revert-note: restores the old build string; schedule and catalog go back to manual `pnpm db:schedule` / `pnpm seed:catalog`; jobs already installed by a build stay in cron.job.

### Task 6: Docs and N25

**Files:** `CLAUDE.md`, `README.md`, `docs/notifications.md`, `docs/product/specs.md`, `.env.example`. `tests/structure/claude-md.test.ts` enforces paths and `pnpm <script>` names.

- CLAUDE.md N24: "Each is scheduled by `pnpm db:schedule` and listed by name in middleware." → "Each is installed by `pnpm db:schedule`, which every production build runs (`pnpm deploy:schedule`), and listed by name in middleware."
- New N25 row after N24 — Rule: "A production build is the only automated writer of catalog and schedule state. It runs only when `VERCEL_ENV` is production, link-checks every URL it inserts, and fails the deploy rather than shipping a catalog or schedule it could not write." Why: "A catalog edit that never reaches the database is invisible, and a schedule nobody reinstalled is a silent outage; tying both to the deploy makes them happen exactly when the code that needs them ships. The gate keeps preview builds from writing production-shaped state, and a hash of the rows (`catalog_syncs`) keeps an unchanged catalog from costing a single request."
- §8 Jobs row: after "(`pnpm db:schedule`)" add "— installed by every production build".
- §13: "applied by script (`pnpm db:policies`)" → "applied by script (`pnpm db:policies`, run by every build)"; vocabulary gains ", and for deploy-time sync (N25) `CatalogSync` (one row per successful production catalog sync; append-only)".
- README build paragraph: new order and string; deploy steps gated on `VERCEL_ENV=production`, no-ops on preview; catalog sync only when the rows' hash changes; a dead new URL or failed schedule fails the deploy; required production build-time vars DATABASE_URL, DIRECT_URL, APP_URL, CRON_SECRET; promote and instant rollback don't rerun scripts — run `pnpm db:schedule` by hand after either.
- docs/notifications.md §3 heading → "The scheduler (automatic on production builds; manual elsewhere)"; first paragraph: production builds run `pnpm deploy:schedule` (APP_URL required, no fallback); the command shown is the manual fallback for preview DBs, rotations between deploys, and after a promote/rollback. §5 step 2: new build order; step 3: "Production: automatic. Preview: `pnpm db:schedule` against the preview database if needed."
- specs F8 Freshness (~l.910) append: "Production builds run `pnpm deploy:catalog` (N25): when the hash of the seed rows differs from the last `catalog_syncs` row, it link-checks only URLs not yet in `courses`, fails the deploy on any dead one before writing, creates new rows active with a staggered `checked_at`, updates existing rows' content without touching `status`, `checked_at` or `verified_at`, rebuilds bundles, then records the sync. `pnpm seed:catalog` remains the manual full re-check; it stamps `verified_at` on an existing row only on a live verdict."
- .env.example: rewrite the CRON_SECRET comment (production builds install the schedule automatically and need `APP_URL`); add `APP_URL=` with "Production origin (https://roleform.koustubh.org). Read by `pnpm deploy:schedule` at build time and by `pnpm db:schedule`."
- [ ] Step 1 — `pnpm vitest run tests/structure/claude-md.test.ts` passes today; edit; re-run → PASS.
- [ ] Step 2 — three green commands.
- [ ] Step 3 (jiraiya) — `docs: N25 production build as the only automated catalog/schedule writer; build order, F8, notifications`. Revert-note: docs only. Do not strike the two after-deploy PENDING lines yet.

## Review focus for neji

1. Lock connection: `advisoryLock` uses `DIRECT_URL` on its own `postgres` session, never `db.$queryRaw`; release runs on every path (gated returns before locking; unchanged, dead, synced, thrown all release); `sql.end()` runs even if unlock throws.
2. Existing-course update path writes no `status`, `checkedAt`, `verifiedAt` (N8 one-way); `newCourseData` uses the index in the FULL `rows.courses`; the manual seed refactor keeps create/update byte-equivalent apart from `verifiedAt` (compare old field lists).
3. Hash completeness: every written field in `CatalogSeedRows` (docKind, isOverview, tags, qualityScore, confidence, summary, parent, depth, structuralFlags); nothing time-varying hashed (else every build re-syncs); `SEED_FORMAT` documented next to `QUALITY_FLOOR` and bundle-rank.
4. Gate cannot be fooled locally: nothing under `scripts/deploy` and nothing `install-schedule.ts` imports loads dotenv before the gate (`catalog-store.ts` imports `lib/db` statically — fine only via the gated dynamic import); `deploySchedule` reads `APP_URL` only.
5. Migration: exactly one CREATE TABLE, one index, five hand-added CHECKs, no stray diff; Revert-note warns the table persists; CHECKs unexercised (no local DB) → add to the `pnpm check:constraints` backlog. `installSchedule` now runs every production build without `sql.begin` — the PENDING non-atomic item is hit on every deploy.

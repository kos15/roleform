# Learning Watch | Read Lanes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Learning-tab gap shows a Watch lane (YouTube) and a Read lane (official docs / tutorials), backed by hand-curated links for all ~100 skills, re-checked by a daily job against a 7-day TTL.

**Architecture:** Catalog entries gain explicit `type`, `docKind`, `isOverview`; a pure `laneOf()` splits resources into lanes everywhere (bundle builder, selection, UI). The plan picks one primary step per gap — only primaries reach the budget, study plan and roadmap; the rest are stored as alternatives. A cron route re-checks links older than 7 days (YouTube via oEmbed, everything else via the existing `checkLiveness`) and rebuilds affected bundles.

**Tech Stack:** Next.js 15 App Router, Prisma over Supabase Postgres, Lucide icons, Supabase pg_cron + pg_net.

**Spec:** `docs/superpowers/specs/2026-10-25-learning-watch-read-design.md` (read it first).

## Global Constraints

- No test runner exists (CLAUDE.md §11). "Tests" here are fixture scripts in `scripts/*-fixtures.ts` using `node:assert/strict`, run with `./node_modules/.bin/tsx --tsconfig tsconfig.scripts.json scripts/<file>.ts` and registered in `package.json` as `check:<name>`.
- `pnpm` scripts currently fail ("packages field missing or empty"); Task 0 fixes that. Until then use the `tsx` form above.
- N8: no model-produced URL ever enters the catalog. A URL is accepted only after the dry check (Task 3) confirms it live **and**, for YouTube, that oEmbed `author_name` matches the curated `author`.
- N9: colours from tokens only — Watch uses `--color-sage-*` (pink), Read uses `--color-accent-*` (marigold). Lucide `Play` / `BookOpen`, `strokeWidth={2.25}` (or the `.lucide` class the page already uses).
- N12: no search or model call added to the request path. S6 stays one call.
- `lib/domain/` imports nothing from db/ai/supabase/next.
- Fixed vocabulary: the catalogued thing is `Course`. New names introduced by this plan: `Lane` (`watch | read`), `DocKind` (`official | tutorial`), `laneOf`, `selectLanes`, `refreshDueLinks`, `rebuildBundles`, `checkVideo`.
- Per-lane ceiling `MAX_PER_LANE = 3`. Quota `capCourses` counts per lane: Free 1, mid 2, top 3; admin range 0–3.
- TTL `CATALOG_TTL_DAYS = 7`; cron runs daily `'17 3 * * *'`.
- Copy pinned by the spec: lane headings "Watch" / "Read"; doc tags "Official" / "Tutorial"; empty lane "No vetted videos for this yet" / "No vetted reading for this yet"; alternative marker "or watch this instead" / "or read this instead"; quota-short line "More videos on a higher plan" / "More reading on a higher plan" linking `/pricing`; quota label "Videos and docs", unit "per lane, per gap".
- Commit after every task; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Old analyses** — plans built before this change have up to 3 steps per gap and no lane: the migration must mark exactly one primary per gap (lowest ordinal) and derive lane from the course type, or the unique index fails and old Learning tabs break. → Task 1 smoke step.
2. **Skill with only one lane** — a gap whose bundle has docs but no videos must pick the top Read item as primary and render the Watch lane's empty line, not crash or hide. → Task 4 fixture.
3. **Free cap of 1** — exactly 1 + 1 shown; the line "More videos on a higher plan" appears only when the bundle actually had more. → Task 4 fixture + Task 6 check.
4. **Tight budget** — a primary longer than the budget shows greyed "Outside your budget" while its alternatives still render as alternatives (no budget cost). → Task 5 fixture.
5. **YouTube URL shapes** — `/shorts/` URLs are rejected at seed; playlist URLs (`/playlist?list=`) and `youtu.be` short links pass oEmbed; a removed video (oEmbed 404/400) is `dead` even though its page returns 200. → Task 3 fixture.

---

### Task 0: Unblock pnpm scripts

**Files:** Modify: `pnpm-workspace.yaml`

- [x] **Step 1:** Replace each `set this to true or false` value with `true` (`@prisma/engines`, `esbuild`, `prisma`, `sharp`).
- [x] **Step 2:** Run `pnpm typecheck`. Expected: exits 0, no "packages field missing" error.
- [x] **Step 3:** Commit `chore: settle pnpm allowBuilds so scripts run`.

### Task 1: Schema — lanes, doc kind, overview flag, TTL stamp, per-lane quota

**Files:**
- Modify: `prisma/schema.prisma` (enums near `ResourceType` ~L192; `Course` ~L1297; `LearningStep` ~L1248; `SkillGap`; `capCourses` defaults at ~L323, ~L462)
- Create: generated migration `prisma/migrations/<ts>_learning_lanes/migration.sql` (+ hand-added SQL below)

**Interfaces — Produces:**
- `enum Lane { watch read }` (`@@map("lane")`), `enum DocKind { official tutorial }` (`@@map("doc_kind")`)
- `Course.docKind DocKind? @map("doc_kind")`, `Course.isOverview Boolean @default(false) @map("is_overview")`, `Course.checkedAt DateTime @default(now()) @map("checked_at") @db.Timestamptz` (keep `verifiedAt` untouched)
- `LearningStep.lane Lane`, `LearningStep.isPrimary Boolean @default(false) @map("is_primary")`
- `SkillGap.cappedLanes Lane[] @default([]) @map("capped_lanes")`
- `capCourses` defaults `4` → `2`

- [x] **Step 1:** Edit the schema, then `pnpm db:migrate:dev --create-only --name learning_lanes`.
- [x] **Step 2:** Append hand SQL to the generated migration, in this order:
  - backfill `courses.doc_kind = 'official'` where `type = 'doc'`; backfill `checked_at = verified_at::timestamptz`;
  - `ALTER TABLE courses ADD CONSTRAINT courses_doc_needs_kind CHECK (type <> 'doc' OR doc_kind IS NOT NULL)`;
  - backfill `learning_steps.lane` from the joined course type (`video`/`course` → `watch`, else `read`) — add the column nullable, backfill, then `SET NOT NULL`;
  - backfill `is_primary = true` for the lowest-`ordinal` step of each `gap_id` (`DISTINCT ON (gap_id) … ORDER BY gap_id, ordinal`);
  - `CREATE UNIQUE INDEX learning_steps_one_primary ON learning_steps (gap_id) WHERE is_primary`;
  - for `users`, `workspace_settings`, `plan_configs`: `UPDATE … SET cap_courses = LEAST(3, CEIL(cap_courses / 2.0))`, drop the old range CHECKs (`users_cap_courses_range`, `workspace_settings_cap_courses_range`, `plan_configs_cap_courses`) and re-add each as `BETWEEN 0 AND 3`.
- [x] **Step 3:** `pnpm db:migrate:dev` against local. Expected: applies cleanly.
- [x] **Step 4 (Review Focus 1):** In `psql`, confirm `select gap_id, count(*) from learning_steps where is_primary group by 1 having count(*) > 1;` returns 0 rows, and `insert` of a `doc` course with null `doc_kind` fails with `courses_doc_needs_kind`.
- [x] **Step 5:** `pnpm db:policies` (no new table, but confirm it still applies). `pnpm typecheck` passes.
- [x] **Step 6:** Commit `feat(db): lanes, doc kind, overview flag, checked_at, per-lane course cap`.

### Task 2: Pure lane rules + per-lane quota values

**Files:**
- Create: `lib/domain/lanes.ts`
- Modify: `lib/domain/quotas.ts:113-124`, `lib/content/pricing.ts:49,59,70,176`
- Create: `scripts/lanes-fixtures.ts`; Modify: `package.json` (`"check:lanes"`)

**Interfaces — Produces:**
- `export type Lane = "watch" | "read"`
- `export function laneOf(type: ResourceType): Lane` — `video` and `course` → `watch`; `doc`, `roadmap`, `repo` → `read`.
- `export const MAX_PER_LANE = 3`
- `export function perLaneCap(uncapped: boolean, capCourses: number): number` — `uncapped ? 3 : clamp(capCourses, 0, 3)`.

- [x] **Step 1: Failing fixture** `scripts/lanes-fixtures.ts`:
  ```ts
  assert.equal(laneOf("video"), "watch"); assert.equal(laneOf("course"), "watch");
  assert.equal(laneOf("doc"), "read"); assert.equal(laneOf("roadmap"), "read"); assert.equal(laneOf("repo"), "read");
  assert.equal(perLaneCap(true, 0), 3); assert.equal(perLaneCap(false, 1), 1);
  assert.equal(perLaneCap(false, 6), 3); assert.equal(perLaneCap(false, -1), 0);
  const q = QUOTAS.find((x) => x.key === "courses")!;
  assert.equal(q.max, 3); assert.equal(q.label, "Videos and docs"); assert.equal(q.unit, "per lane, per gap");
  assert.deepEqual(PLANS.map((p) => p.caps.courses), [1, 2, 3]);
  ```
- [x] **Step 2:** Run it. Expected: FAIL (module not found).
- [x] **Step 3:** Implement `lib/domain/lanes.ts`; set the `courses` quota `max: 3`, label/unit as above, description "Vetted videos and docs offered per lane for each unevidenced requirement. Gaps are always shown, with or without material."; `PLANS` caps courses `1 / 2 / 3`; `NOTES.courses` → "The gap is always shown, with or without a video or doc beside it."
- [x] **Step 4:** Run fixture → PASS. Run `pnpm check:quotas` → PASS (update its expectations if it pins 6).
- [x] **Step 5:** Commit `feat(domain): lanes and per-lane course cap`.

### Task 3: Catalog shape, YouTube oEmbed liveness, dry check

**Files:**
- Modify: `lib/catalog/courses.ts` (`CourseDef`), `lib/catalog/quality.ts` (`typeOf` prefers `course.type`), `lib/catalog/liveness.ts`
- Create: `lib/catalog/creators.ts`, `scripts/catalog-check.ts`, `scripts/liveness-fixtures.ts`
- Modify: `package.json` (`"check:catalog"`, `"check:liveness"`)

**Interfaces — Produces:**
- `CourseDef` gains `type?: ResourceType`, `docKind?: "official" | "tutorial"`, `isOverview?: boolean`, `author?: string`.
- `export async function checkVideo(url: string): Promise<{ liveness: Liveness; authorName: string | null }>` — GET `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`; 200 → live with `author_name`; 401/403 → live (embedding disabled), authorName null; 400/404 → dead; network error/429/5xx → blocked.
- `export async function checkCourseLink(def: { url: string; type: ResourceType }): Promise<{ liveness: Liveness; authorName: string | null }>` — videos on youtube.com/youtu.be → `checkVideo`, else `checkLiveness`.
- `export const KNOWN_CREATORS: Record<string, string[]>` keyed by taxonomy root (e.g. `"Frontend"`, `"DevOps"`) — curator guidance.
- `export function catalogProblems(courses: CourseDef[], skills: string[]): string[]` (pure, in `scripts/catalog-check.ts` or `lib/catalog/courses.ts`): every skill has ≥1 entry with `skills[0] === name` in each lane; every `doc` has `docKind`; no URL contains `/shorts/`; no duplicate URL.

- [x] **Step 1: Failing fixture** `scripts/liveness-fixtures.ts` — inject `fetch` (add optional `fetchImpl` param to `checkVideo`): 200 `{author_name:"Fireship"}` → `{liveness:"live", authorName:"Fireship"}`; 404 → dead; 400 → dead; 403 → live; thrown error → blocked. Plus `catalogProblems` cases: a `/shorts/` URL, a doc without `docKind`, a skill with no Read entry — each yields one problem string naming the skill/URL.
- [x] **Step 2:** Run → FAIL.
- [x] **Step 3:** Implement. `scripts/catalog-check.ts` (no DB): runs `catalogProblems`, then `checkCourseLink` on every entry (concurrency 5); for YouTube entries, fails when `authorName` is non-null and ≠ `def.author` (case-insensitive, trimmed); warns when `author` ∉ `KNOWN_CREATORS` for its skill's root. Exit 1 on any problem/dead/mismatch; prints a per-skill table `skill · lane · author · title · url`.
- [x] **Step 4 (Review Focus 5):** fixture also covers `youtu.be/<id>` and `youtube.com/playlist?list=<id>` routing to `checkVideo`. Run → PASS.
- [x] **Step 5:** Backfill `type` + `docKind` on the existing ~90 `COURSES` entries (roadmap helper sets `type: "roadmap"`). `pnpm check:catalog` will still fail on coverage — expected until Task 7.
- [x] **Step 6:** Commit `feat(catalog): explicit types, oEmbed liveness, catalog dry check`.

### Task 4: Bundles and selection per lane

**Files:**
- Create: `lib/learning/rebuild-bundles.ts` (logic moved out of `scripts/rebuild-bundles.ts`, which becomes a thin caller)
- Modify: `lib/domain/selection.ts`, `lib/learning/bundles.ts:~85`
- Create: `scripts/selection-fixtures.ts`; Modify: `package.json` (`"check:selection"`)

**Interfaces:**
- Consumes: `laneOf`, `MAX_PER_LANE` (Task 2); `Course.docKind`, `Course.isOverview` (Task 1).
- Produces:
  - `BundledResource` gains `docKind: "official" | "tutorial" | null`, `isOverview: boolean`.
  - `export function selectLanes(bundle: BundledResource[], context: SelectionContext, perLane: number): { watch: BundledResource[]; read: BundledResource[] }` — partitions by `laneOf(r.type)`, runs `selectResources(lane, context, perLane)` on each.
  - `rankOf`: `isOverview` → `rank -= 0.5`; in Read, `docKind === "official"` → `rank += 0.1`.
  - `export async function rebuildBundles(skillIds?: string[]): Promise<{ written: number; empty: number }>` — same algorithm, but `BUNDLE_SIZE` becomes per lane (`3` watch + `3` read, total ≤ 6) and `MAX_PER_AUTHOR` (2) is counted per lane.
  - `MAX_RESOURCES_PER_GAP` removed; callers use `MAX_PER_LANE`.

- [x] **Step 1: Failing fixture** `scripts/selection-fixtures.ts`:
  - bundle of 3 videos (one `isOverview`, shortest) + 2 docs (one official) → `selectLanes(..., 2)` gives `watch[0]` = the non-overview full course, `read[0]` = official doc.
  - (Review Focus 2) bundle of docs only → `watch` is `[]`, `read.length > 0`.
  - (Review Focus 3) `perLane = 1` → exactly one per lane.
- [x] **Step 2:** Run → FAIL.
- [x] **Step 3:** Implement; `lookupBundles` selects and maps `docKind`, `isOverview`. `rebuildBundles` reads `courseSkill` + course `status: "active"` exactly as the script did; with `skillIds` given, only those skills' bundles are rewritten.
- [x] **Step 4:** Run fixture → PASS. `pnpm bundles:rebuild` locally → prints written/empty counts, exits 0.
- [x] **Step 5:** Commit `feat(learning): per-lane bundles and selection`.

### Task 5: Plan with one primary per gap; readers honour it

**Files:**
- Modify: `lib/learning/build-plan.ts:165-300, 380-420`, `lib/db/queries/learning.ts:80-170`, `lib/db/queries/roadmap.ts:25-60`, `lib/db/queries/study.ts:35-60`, `lib/domain/roadmap.ts:120-140`
- Create: `scripts/primary-fixtures.ts`; Modify: `package.json` (`"check:primary"`)

**Interfaces:**
- Consumes: `selectLanes`, `perLaneCap` (Tasks 2, 4).
- Produces:
  - `export function primaryOf(lanes: { watch: BundledResource[]; read: BundledResource[] }): BundledResource | null` in `lib/domain/selection.ts` — `watch[0] ?? read[0] ?? null`.
  - `LearningStepView` gains `lane: Lane`, `docKind: "official" | "tutorial" | null`, `isPrimary: boolean`. `LearningGapView` gains `cappedLanes: Lane[]`.
  - `CompileLearningStep` gains `skillName: string`; roadmap label for a learning step becomes `Learn ${short(skillName, 50)}` (entry label suffix kept when present).

- [x] **Step 1: Failing fixture** `scripts/primary-fixtures.ts` (pure parts): `primaryOf` cases (videos present → top video; docs only → top doc; empty → null); `compileRoadmap` with one learning step for "Kubernetes" → label `Learn Kubernetes`.
- [x] **Step 2:** Run → FAIL.
- [x] **Step 3:** In `build-plan.ts`: `perLane = perLaneCap(isUncapped(account.role), account.capCourses)`; per gap `lanes = selectLanes(bundle, ctx, perLane)`; `cappedLanes` = lanes where the bundle held more items of that lane than `perLane`; `plannable` contains **only** `primaryOf(lanes)`; S6 receives only scheduled primaries (unchanged cost). Write every selected resource of both lanes as a `LearningStep` with `lane`, `isPrimary` (true only for a scheduled primary); non-primary rows take the primary's `ordinal`/`startsAtMin` (0/0 if no scheduled primary) and `note: ""`. Write `cappedLanes` on the `SkillGap`. Corpus-gap/fallback logic keys off "both lanes empty".
- [x] **Step 4:** In `getLearningPlan`, `plannable` maps only `isPrimary` steps; non-primary steps get `deferred: false`. In `roadmap.ts` and `study.ts` queries add `where: { isPrimary: true }` to `steps`; `fallbackGaps` / topic filter still use "no primary step".
- [x] **Step 5 (Review Focus 4):** fixture asserts `solvePlan([primaryLongerThanBudget], 30).deferred.length === 1`; manual: open a Learning tab with a 30-min budget where the primary is longer → primary greyed, alternatives shown normally.
- [x] **Step 6:** Run fixture → PASS; `pnpm check:coverage`, `pnpm typecheck` → PASS.
- [x] **Step 7:** Commit `feat(learning): one primary per gap; alternatives carry no budget`.

### Task 6: Watch | Read lanes UI

**Files:**
- Create: `app/(app)/analysis/[id]/learning/lanes.tsx` (server component)
- Modify: `app/(app)/analysis/[id]/learning/page.tsx:205-275` (replace the `<ol>` block)

**Interfaces — Consumes:** `LearningGapView.steps[].{lane, docKind, isPrimary, deferred}`, `cappedLanes` (Task 5).
- Produces: `export function Lanes({ steps, cappedLanes }: { steps: LearningStepView[]; cappedLanes: Lane[] })`.

- [x] **Step 1:** Build `Lanes`: grid `[grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]` so it stacks Watch-first on phones. Lane heading: 30px pill circle (`bg-[var(--color-sage-500)]` + `Play`, or `bg-[var(--color-accent-500)]` + `BookOpen`) + `eyebrow` "Watch"/"Read". Each row keeps today's anatomy (author, title, entry label, note, price, length, Open ↗) with the lane icon replacing `mark`; docs show `<Tag>` "Official"/"Tutorial"; non-primary rows show muted "or watch this instead" / "or read this instead"; deferred primary keeps `opacity-50` + "Outside your budget". Empty lane → muted line from Global Constraints. Lane in `cappedLanes` → `<Link href="/pricing">` "More videos on a higher plan" / "More reading on a higher plan".
- [x] **Step 2:** Swap the step list in `page.tsx` for `<Lanes …/>`; keep `FallbackNote` when **both** lanes are empty. Header count `scheduled` counts only `isPrimary && !deferred`.
- [x] **Step 3:** `pnpm typecheck`; grep the two new/changed files for `#[0-9a-f]{3,6}` → none.
- [x] **Step 4:** `pnpm dev`, open a ready analysis's Learning tab at desktop and 375px width. Expected: two lanes, correct icons, stacking, empty-lane copy on a single-lane skill, budget greying. (Review Focus 3: set a member's `cap_courses = 1` locally → 1 + 1 and the higher-plan line where applicable.)
- [x] **Step 5:** Commit `feat(learning): Watch | Read lanes with type icons`.

### Task 7: Curate videos and docs for all ~100 skills

**Files:** Modify: `lib/catalog/courses.ts`, `lib/catalog/creators.ts`

Split into four commits by `SKILLS` order (≈25 skills each). Per skill: 2–3 videos (at least one non-overview full/crash course by a known creator; optional `isOverview: true` short), 2–3 docs (≥1 `docKind: "official"` where an official source exists, plus MDN / roadmap.sh / official getting-started as `"tutorial"`). `skills[0]` is the taught skill. Deep links, not homepages. `level`, `lengthMinutes`, `priceLabel`, `mark`, `author` set honestly; `lengthMinutes` for a video from the video's real duration.

- [ ] **Step 1 (per batch):** Add entries. Do not keep any URL you have not just checked.
- [ ] **Step 2 (per batch):** `pnpm check:catalog`. Expected: zero dead, zero author mismatches for this batch's skills (coverage errors only for later batches). Remove or replace anything that fails — never retry a guessed URL variant.
- [ ] **Step 3 (per batch):** Commit `feat(catalog): videos and docs for <first>…<last>`.
- [ ] **Step 4 (final):** `pnpm check:catalog` exits 0 with full coverage; paste its per-skill table into the PR description for the member's review.

### Task 8: Seed stagger + daily refresh cron

**Files:**
- Modify: `scripts/seed-catalog.ts`, `scripts/schedule-reminders.ts`
- Create: `lib/catalog/refresh.ts`, `app/api/cron/catalog/route.ts`, `scripts/refresh-fixtures.ts`; Modify: `package.json` (`"check:refresh"`)

**Interfaces:**
- Consumes: `checkCourseLink` (Task 3), `rebuildBundles` (Task 4), `catalogProblems` (Task 3).
- Produces:
  - `export const CATALOG_TTL_DAYS = 7`
  - `export function isDue(checkedAt: Date, now: Date): boolean` — `now - checkedAt >= 7 days`.
  - `export async function refreshDueLinks(opts: { limit: number; now?: Date; deadlineMs: number }): Promise<{ checked: number; dead: number; blocked: number; revived: number; overdue30: number }>` — oldest `checked_at` first among `status in (active, stale)` that are due; writes `checked_at`, `status` (`dead` on dead; `active` on live/blocked, counting `revived` when it was not active); stops at `deadlineMs`; calls `rebuildBundles(affectedSkillIds)` when any status changed. Logs counts only (N7).

- [ ] **Step 1: Failing fixture** `scripts/refresh-fixtures.ts`: `isDue` at 6d23h → false, 7d → true.
- [ ] **Step 2:** Run → FAIL; implement; run → PASS.
- [ ] **Step 3:** Seed: use `def.type` / `def.docKind` / `def.isOverview`; run `catalogProblems` first and exit 1 on any; use `checkCourseLink`; set `checkedAt = today − (index % 7) days`.
- [ ] **Step 4:** Route `app/api/cron/catalog/route.ts`: copy the `authorised()` Bearer check from the reminders route; `maxDuration = 300`; `refreshDueLinks({ limit: 150, deadlineMs: Date.now() + 270_000 })`; return the counts as JSON. GET and POST.
- [ ] **Step 5:** `schedule-reminders.ts` also schedules job `roleform-catalog-refresh` at `'17 3 * * *'` against `/api/cron/catalog` (same vault secret, `timeout_milliseconds := 290000`); `--remove` unschedules both.
- [ ] **Step 6:** Local: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/catalog` → JSON counts, only rows with `checked_at` ≥ 7 days old touched; without the header → 401.
- [ ] **Step 7:** Commit `feat(catalog): daily link refresh against a 7-day TTL`.

### Task 9: Docs

**Files:** Modify: `specs.md` (F8 + §14 if a new action/route is listed), `CLAUDE.md` (N23), `lib/catalog/courses.ts` header, `scripts/link-check.ts` header.

- [ ] **Step 1:** specs F8: lanes, per-lane cap, primary-only budget/roadmap/study, alternatives, `cappedLanes` copy, daily refresh + 7-day TTL best effort, oEmbed for videos.
- [ ] **Step 2:** CLAUDE.md N23 last sentence → "`/api/cron/reminders` and `/api/cron/catalog` (daily link refresh) are the only scheduled paths in the product." Update `courses.ts` header ("quarterly" → daily job, 7-day TTL; `pnpm check:links` remains the manual full sweep).
- [ ] **Step 3:** Commit `docs: Watch | Read lanes, per-lane cap, catalog refresh`.

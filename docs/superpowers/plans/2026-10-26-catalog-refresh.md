# Catalog Refresh (Learning Watch | Read Tasks 8–9) Implementation Plan

> Planned by `shikamaru` from `hokage`'s decision (user-approved 2026-10-26: new rule N24; dead links
> stay dead until a curator re-seeds; Fluid compute assumed, 300 s). Executed per task by `kakashi`,
> reviewed by `neji`, committed by `jiraiya` (CLAUDE.md §16).

**Goal:** Re-check, daily, the catalog links whose 7-day TTL has lapsed; a conclusive dead verdict flips
`active → dead` (one way); rebuild bundles only when needed; the seed staggers `checked_at` across 7 days;
document the new rule N24.

**Architecture:** Pure half `lib/domain/catalog-refresh.ts` (TTL arithmetic, status transition, stagger).
I/O half `lib/services/learning/refresh-catalog.ts`: `refreshDueLinks` takes injected `check`, `store`,
`rebuild`, `clock`, so its logic is unit-tested with an in-memory store; the Prisma store is a thin adapter.
`lib/services/cron.ts` holds the shared Bearer check, the closed `CRON_JOBS` list and the pg_net command
builder; route, middleware and scheduler all read it.

**Baseline:** `pnpm test` 19 files / 237 green; `pnpm -s typecheck` clean.

## Global constraints

- N7 counts-only logs · N12/N13 no model call, no `lib/ai` import under `app/api/cron` · N24 (new): closed
  list, claim before acting, stop before deadline, secret checked before any read.
- §10: `lib/domain` no I/O; `lib/catalog` stays DB-free — do NOT create `lib/catalog/refresh.ts`.
- §11: every task starts with a failing test. §13: `Course`, never "resource".
- No migration. Never run `prisma migrate dev`.
- Never touch entries in `lib/catalog/courses.ts` (catalog curation is separate work).

## Rulings

- **Claim predicate (deviation from hokage, accepted by the main session):** hokage specified
  `updateMany({ where: { id, checkedAt: <read value> } })`. Postgres `timestamptz` keeps microseconds; JS
  `Date` milliseconds — rows stamped by the column default `now()` would never match and be skipped forever.
  Claim with `where: { id, status: "active", checkedAt: { lte: cutoff } }` instead: still compare-and-set
  (the first claimer sets `checkedAt = now`, after which the row is no longer `≤ cutoff`), and it refuses a
  row a curator quarantined mid-run.
- The seed refuses to run while `catalogProblems` reports any problem (hokage). Intended.

---

### Task 1: Pure TTL rules

**Files:** Create `lib/domain/catalog-refresh.ts`; Test `tests/domain/catalog-refresh.test.ts`

**Produces:**
```ts
import type { Liveness } from "@/lib/catalog/liveness";   // type-only; precedent: selection.ts
export const CATALOG_TTL_DAYS = 7;
export const OVERDUE_DAYS = 30;
export const DAY_MS = 86_400_000;
export function daysBefore(now: Date, days: number): Date;           // new Date(now.getTime() - days * DAY_MS)
export function isDue(checkedAt: Date, now: Date): boolean;           // now - checkedAt >= 7 * DAY_MS
export function nextStatus(current: "active", verdict: Liveness): "active" | "dead"; // dead → "dead", else "active"
```

- [ ] **Step 1: failing tests** — `now = new Date("2026-10-26T03:17:00.000Z")`, `H = 3_600_000`:
  `CATALOG_TTL_DAYS === 7`, `OVERDUE_DAYS === 30`;
  `daysBefore(now, 7).toISOString() === "2026-10-19T03:17:00.000Z"`, `daysBefore(now, 30)` → `"2026-09-26T03:17:00.000Z"`;
  `isDue(new Date(now.getTime() - (6*24+23)*H), now) === false`; `isDue(daysBefore(now, 7), now) === true`;
  `isDue(daysBefore(now, 30), now) === true`; `isDue(now, now) === false`; future `isDue(new Date(now.getTime() + H), now) === false`;
  `nextStatus("active","dead") === "dead"`, `"live"` → `"active"`, `"blocked"` → `"active"`.
- [ ] **Step 2:** `pnpm vitest run tests/domain/catalog-refresh.test.ts` → FAIL `Failed to resolve import "@/lib/domain/catalog-refresh"`.
- [ ] **Step 3:** Implement. Header: "PURE. The catalog re-check's TTL rules (N24, F8). Status moves one way: active → dead."
- [ ] **Step 4:** PASS; `pnpm test` (layout "lib/domain imports no I/O layer" stays green) and `pnpm -s typecheck` green.
- [ ] **Step 5 (jiraiya):** `feat(catalog): pure 7-day TTL rules for the link re-check` — Revert-note: removes an unused pure module.

### Task 2: Shared cron module + closed-list structure test

**Files:** Create `lib/services/cron.ts`, `tests/services/cron.test.ts`, `tests/structure/cron.test.ts`; Modify `app/api/cron/reminders/route.ts`

**Produces:**
```ts
import "server-only";
import { timingSafeEqual } from "node:crypto";
export interface CronJob { name: string; path: `/api/cron/${string}`; schedule: string; timeoutMs: number }
export const CRON_JOBS: readonly CronJob[] = [
  { name: "roleform-round-reminders", path: "/api/cron/reminders", schedule: "*/5 * * * *", timeoutMs: 55_000 },
];  // catalog entry added in Task 4 — keeps every task green
export function cronAuthorised(request: Request): boolean; // body byte-identical to reminders route.ts:23–29
```

- [ ] **Step 1a: `tests/services/cron.test.ts`** (`vi.stubEnv`, `afterEach(vi.unstubAllEnvs)`, `S = "s".repeat(32)`,
  `new Request("https://x.test/api/cron/reminders", { headers })`): `CRON_SECRET=""` + `"Bearer "` → false;
  `S` + `Bearer ${S}` → true; `Bearer wrong` → false; no header → false; `bearer ${S}` → false;
  `Bearer ${S}x` → false, no throw; `CRON_JOBS` toEqual the single reminders entry; names unique.
- [ ] **Step 1b: `tests/structure/cron.test.ts`** (helpers from `./files`, `CRON_JOBS` from `@/lib/services/cron`):
  - "every directory under app/api/cron is a CRON_JOBS entry, and every entry has one" —
    `entriesOf("app/api/cron").filter(e=>e.isDir).map(e=>"/api/cron/"+e.name).sort()` toEqual `CRON_JOBS.map(j=>j.path).sort()`
  - "middleware names each cron path, with no wildcard" — `sourceOf("middleware.ts")` includes `"${job.path}"`; not `/\/api\/cron(\/)?\(\.\*\)/`
  - "each cron route checks cronAuthorised before anything else" — `importsOf("app"+path+"/route.ts")` contains `"@/lib/services/cron"`;
    source matches `/if \(!cronAuthorised\(request\)\) return new Response\("unauthorised", \{ status: 401 \}\)/`
  - "no cron route keeps its own Bearer check" — no `filesUnder("app/api/cron")` file contains `timingSafeEqual`
  - "each cron route's maxDuration is ≤ 300 s and covers its pg_net timeout" — `n = Number(/export const maxDuration = (\d+);/.exec(src)![1])`; `n <= 300`; `job.timeoutMs <= n*1000`
  - "no cron route reaches lib/ai" — no specifier matches `/(^@\/lib\/ai|\/lib\/ai)(\/|$)/`
- [ ] **Step 2:** run both → FAIL (`Failed to resolve import "@/lib/services/cron"`; then "imports cronAuthorised" / "no own Bearer check" on the reminders route).
- [ ] **Step 3:** Move `authorised` → `cronAuthorised` (body byte-identical). Reminders route: drop local fn + `node:crypto` import, import `cronAuthorised`, call `if (!cronAuthorised(request)) return new Response("unauthorised", { status: 401 });`; header `(scripts/db/schedule-reminders.ts)` → `(scripts/db/schedule.ts)`. `cron.ts` header: "Scheduled work is a closed list (N24). A new entry needs a route, a middleware line, and a reason it cannot be settled on read."
- [ ] **Step 4:** PASS; full suite + typecheck green.
- [ ] **Step 5 (jiraiya):** `refactor(cron): shared cronAuthorised and a closed CRON_JOBS list` — Revert-note: restores inline Bearer check; no behaviour change.

### Task 3: `refreshDueLinks` with injected seams

**Files:** Create `lib/services/learning/refresh-catalog.ts`; Test `tests/services/learning/refresh-catalog.test.ts`

**Consumes:** `checkCourseLink`, `LinkCheck` (`lib/catalog/liveness`); `ResourceType` (`lib/catalog/quality`); `rebuildBundles` (`./rebuild-bundles`); Task 1 exports; `db`.

**Produces:**
```ts
import "server-only";
export interface DueCourse { id: string; url: string; type: ResourceType; checkedAt: Date }
export interface RefreshStore {
  due(cutoff: Date, limit: number): Promise<DueCourse[]>;
  claim(id: string, cutoff: Date, now: Date): Promise<boolean>;
  markDead(id: string): Promise<void>;
  bundlesNamingNonActive(): Promise<number>;
  countOverdue(cutoff: Date): Promise<number>;
}
export const prismaRefreshStore: RefreshStore;
export interface RefreshSummary {
  due: number; checked: number; dead: number; blocked: number; skipped: number;
  overdue30: number; rebuilt: "yes" | "no" | "failed";
}
export async function refreshDueLinks(opts: {
  claimUntil: number;                 // epoch ms; no new claim at or after it
  limit?: number;                     // default 150
  now?: Date;                         // default new Date()
  check?: (def: { url: string; type: ResourceType }) => Promise<LinkCheck>; // default checkCourseLink
  store?: RefreshStore;               // default prismaRefreshStore
  rebuild?: () => Promise<unknown>;   // default () => rebuildBundles()  — NO argument
  clock?: () => number;               // default Date.now
}): Promise<RefreshSummary>;
export const CONCURRENCY = 5;
```

**`prismaRefreshStore`, exactly:**
- `due`: `db.course.findMany({ where: { status: "active", checkedAt: { lte: cutoff } }, orderBy: { checkedAt: "asc" }, take: limit, select: { id: true, url: true, type: true, checkedAt: true } })`
- `claim`: `(await db.course.updateMany({ where: { id, status: "active", checkedAt: { lte: cutoff } }, data: { checkedAt: now } })).count === 1`
- `markDead`: `db.course.updateMany({ where: { id, status: "active" }, data: { status: "dead" } })`
- `bundlesNamingNonActive`: ids of `status: { not: "active" }` courses; `0` if none; else `db.skillBundle.count({ where: { rankedCourseIds: { hasSome: ids } } })`
- `countOverdue`: `db.course.count({ where: { status: "active", checkedAt: { lt: cutoff } } })`

**Algorithm:**
1. `cutoff = daysBefore(now, CATALOG_TTL_DAYS)`; `rows = store.due(cutoff, limit)`.
2. `CONCURRENCY` workers pull the next index from a shared counter. Per iteration: if `clock() >= claimUntil` stop;
   `claim(id, cutoff, now)` false → `skipped++`, continue; else `checked++`,
   `verdict = (await check({ url, type }).catch(() => ({ liveness: "blocked" }))).liveness`;
   `nextStatus("active", verdict) === "dead"` → `await store.markDead(id)`, `dead++`; else `verdict === "blocked"` → `blocked++`.
3. `needs = dead > 0 || (await store.bundlesNamingNonActive()) > 0`.
4. `needs` → `try { await rebuild(); rebuilt = "yes" } catch { rebuilt = "failed" }`; else `"no"`. Never rethrow.
5. `overdue30 = await store.countOverdue(daysBefore(now, OVERDUE_DAYS))`.
6. One line `console.log(\`[cron:catalog] due=… checked=… dead=… blocked=… skipped=… overdue30=… rebuilt=…\`)`; return.

- [ ] **Step 1: failing tests.** Fixtures: `now = 2026-10-26T03:17:00.000Z`; `row(id, daysOld)` → `{ id, url: \`https://example.test/${id}\`, type: "doc", checkedAt: now − daysOld days }`; `makeStore(rows, { lose = new Set(), nonActiveBundles = 0, overdue = 0 })` of `vi.fn`s; defaults `check` live (`{ liveness: "live", authorName: null }`), `rebuild = vi.fn(async () => ({}))`, `claimUntil: Infinity`; `console.log` spied silent.
  - T1 due called with `(2026-10-19T03:17:00.000Z, 150)`; `limit: 20` passes 20.
  - T2 rows a,b,c (8,9,10 d), lose b: claim called with `("a", 2026-10-19T03:17Z, now)`; check urls only a, c; summary ⊇ `{ due: 3, checked: 2, skipped: 1 }`.
  - T3 a dead → `markDead("a")`; `rebuild` once, no args; `dead 1`, `rebuilt "yes"`.
  - T4 a blocked, b live → `blocked 1, dead 0`, no markDead.
  - T5 nothing dead, no stale bundles → no rebuild, `"no"`.
  - T6 `nonActiveBundles: 2` → rebuild once, `"yes"`.
  - T7 rebuild rejects + a dead → resolves `{ dead: 1, rebuilt: "failed" }`, markDead("a") called.
  - T8 10 rows, clock `0,0,0` then `1000`, `claimUntil: 1000` → claim ×3, `checked 3`, `due 10`.
  - T9 12 rows, inflight counter with `setTimeout(0)` → `max === 5`, `checked 12`.
  - T10 check rejects → `{ blocked: 1, dead: 0 }`, no markDead.
  - T11 countOverdue called with `2026-09-26T03:17:00.000Z`; `overdue: 4` → `overdue30 4`.
  - T12 a dead, lose b, overdue 4 → summary toEqual `{ due: 2, checked: 1, dead: 1, blocked: 0, skipped: 1, overdue30: 4, rebuilt: "yes" }`; console.log once with `"[cron:catalog] due=2 checked=1 dead=1 blocked=0 skipped=1 overdue30=4 rebuilt=yes"`.
  - T13 source of `lib/services/learning/refresh-catalog.ts` (via `../../structure/files`) does not match `/verifiedAt|["']stale["']|\btitle:|\bauthor:|\bdocKind:|\burl:\s*[^ts\s]/`; contains `data: { checkedAt: now }` and `data: { status: "dead" }`.
- [ ] **Step 2:** run → FAIL `Failed to resolve import "@/lib/services/learning/refresh-catalog"`.
- [ ] **Step 3:** Implement. Header: never called from a user request; shares the I1 reasoning in `rebuild-bundles.ts`.
- [ ] **Step 4:** PASS; suite + typecheck green.
- [ ] **Step 5 (jiraiya):** `feat(learning): refreshDueLinks re-checks catalog links past a 7-day TTL` — Revert-note: removes an uncalled service.

### Task 4: `/api/cron/catalog` route, middleware, `CRON_JOBS` entry

**Files:** Create `app/api/cron/catalog/route.ts`, `tests/app/cron-catalog.test.ts`; Modify `lib/services/cron.ts`, `middleware.ts`, `tests/services/cron.test.ts`

**Produces:**
```ts
export const dynamic = "force-dynamic";
export const maxDuration = 300;
async function handle(request: Request): Promise<Response>;
//  if (!cronAuthorised(request)) return new Response("unauthorised", { status: 401 });
//  const summary = await refreshDueLinks({ limit: 150, claimUntil: Date.now() + 200_000 });
//  return Response.json(summary, { status: summary.rebuilt === "failed" ? 500 : 200 });
export const GET = handle;
export const POST = handle;
```
New entry: `{ name: "roleform-catalog-refresh", path: "/api/cron/catalog", schedule: "17 3 * * *", timeoutMs: 290_000 }`.

- [ ] **Step 1a:** cron.test pin → both entries, reminders first.
- [ ] **Step 1b: `tests/app/cron-catalog.test.ts`** (`vi.mock("@/lib/services/learning/refresh-catalog", () => ({ refreshDueLinks: vi.fn() }))`, `vi.stubEnv("CRON_SECRET", S)`, fake timers at `2026-10-26T03:17:00.000Z`): no header → 401, not called; `CRON_SECRET=""` + `Bearer ${S}` → 401; authorised + mock `{ due: 3, checked: 3, dead: 0, blocked: 1, skipped: 0, overdue30: 0, rebuilt: "no" }` → 200, json equal, called with `{ limit: 150, claimUntil: Date.parse("2026-10-26T03:20:20.000Z") }`; `rebuilt: "failed"` → 500 with body `rebuilt === "failed"`; `POST === GET`, `maxDuration === 300`, `dynamic === "force-dynamic"`.
- [ ] **Step 2:** run cron, cron-catalog, structure/cron → FAIL (pin; unresolved route import; structure "every directory…"/"middleware names…" once the entry exists).
- [ ] **Step 3:** Append the job; create the route (header: daily via pg_cron `scripts/db/schedule.ts`, Bearer before any read, stops claiming at 200 s, counts only, N24). In `middleware.ts` `isPublic`, right after `"/api/cron/reminders",`:
  ```
  // F8: the daily catalog link re-check (N24). Same lock as the reminders
  // route — CRON_SECRET is checked before anything is read.
  "/api/cron/catalog",
  ```
  No wildcard.
- [ ] **Step 4:** PASS; suite + typecheck green.
- [ ] **Step 5 (jiraiya):** `feat(catalog): /api/cron/catalog daily link re-check (N24)` — Revert-note: a scheduled pg_cron job then 404s until `pnpm db:schedule --remove`.

### Task 5: Scheduler installs every `CRON_JOBS` job

**Files:** `git mv scripts/db/schedule-reminders.ts scripts/db/schedule.ts`; Modify `package.json` (`"db:schedule": "pnpm script scripts/db/schedule.ts"`), `lib/services/cron.ts`, `tests/services/cron.test.ts`. Leave `scripts/tools/maps/08-scripts.json` untouched.

**Produces (in `lib/services/cron.ts`):**
```ts
export const CRON_SECRET_NAME = "roleform_cron_secret";
export function scheduleCommand(job: CronJob, appUrl: string): string;
// existing net.http_get literal: url := '<appUrl><job.path>' (single quotes doubled), secret from
// vault.decrypted_secrets where name = 'roleform_cron_secret', timeout_milliseconds := <job.timeoutMs>
```
- [ ] **Step 1:** `scheduleCommand(CRON_JOBS[1], "https://roleform.koustubh.org")` contains `"url := 'https://roleform.koustubh.org/api/cron/catalog'"`, `"timeout_milliseconds := 290000"`, `"where name = 'roleform_cron_secret'"`; `scheduleCommand(CRON_JOBS[0], "https://a.test/o'x")` contains `"url := 'https://a.test/o''x/api/cron/reminders'"` and `"timeout_milliseconds := 55000"`; `CRON_SECRET_NAME === "roleform_cron_secret"`.
- [ ] **Step 2:** FAIL `scheduleCommand is not a function`.
- [ ] **Step 3:** Implement; rewrite the script around it: keep APP_URL https and 32-char secret checks and extension creation; Vault update/create with description `'Bearer token for /api/cron/* (N24)'`; per job unschedule-by-name then `cron.schedule(name, schedule, scheduleCommand(job, appUrl))`, log `scheduled <name>: <schedule> → <endpoint>`; `--remove` unschedules every name; import `../../lib/services/cron`; header notes it keeps the existing job name so the old `cron.job` row is replaced.
- [ ] **Step 4:** PASS; `pnpm test` (incl. "every package.json script path exists"), `pnpm -s typecheck`, `pnpm exec tsc -p tsconfig.scripts.json --noEmit` (no errors in `scripts/db/schedule.ts`; report only new errors vs base).
- [ ] **Step 5 (jiraiya):** `refactor(db): pnpm db:schedule installs every CRON_JOBS job` — Revert-note: an already-scheduled DB keeps `roleform-catalog-refresh` until removed by SQL.

### Task 6: Seed stagger, seed gate, link-check alignment

**Files:** Modify `lib/domain/catalog-refresh.ts`, `tests/domain/catalog-refresh.test.ts`, `scripts/catalog/seed-catalog.ts`, `scripts/catalog/link-check.ts`; Create `tests/structure/catalog-scripts.test.ts`

**Produces:** `export function staggeredCheckedAt(now: Date, index: number): Date;` → `daysBefore(now, index % CATALOG_TTL_DAYS)`.

- [ ] **Step 1a:** index 0 → `"2026-10-26T03:17:00.000Z"`, 6 → `"2026-10-20T03:17:00.000Z"`, 7 → `"2026-10-26…"`, 13 → `"2026-10-20…"`; `[0..6].every(i => !isDue(staggeredCheckedAt(now,i), now))`; `next = daysBefore(now, -1)`: index 6 due, index 5 not.
- [ ] **Step 1b: `tests/structure/catalog-scripts.test.ts`:** seed + link-check sources contain `checkCourseLink(` and not `checkLiveness`; seed `indexOf("catalogProblems(")` > -1 and < `indexOf("db.template.upsert")`; seed contains `docKind:` and `isOverview:`.
- [ ] **Step 2:** FAIL (`staggeredCheckedAt is not a function` + three structure tests).
- [ ] **Step 3a seed:** first in `main()`: `catalogProblems(COURSES, SKILLS.map(s => s.name))` → print under "Catalog has problems (pnpm check:catalog):" and `process.exit(1)`; `checkLiveness(course.url)` → `(await checkCourseLink({ url: course.url, type: typeOf(course) })).liveness`; iterate `COURSES.entries()`; add `docKind: course.docKind ?? null`, `isOverview: course.isOverview ?? false`; with link check both create/update get `status: "active"`, `checkedAt: staggeredCheckedAt(today, index)`; with `--skip-link-check` create gets `status: "active"`, `checkedAt: daysBefore(today, CATALOG_TTL_DAYS)`, update writes neither; `verifiedAt` unchanged; header mentions the stagger.
- [ ] **Step 3b link-check:** `checkCourseLink({ url, type: course.type })`; every checked row `data.checkedAt = now`; write `status: "dead"` only when `course.status === "active" && nextStatus("active", liveness) === "dead"`, never write `active`; dead verdict on a non-active row counted, not written; keep `verifiedAt` refresh on non-dead; roadmap fallbacks via `checkCourseLink({ url, type: "roadmap" })`; header "M7.10 — quarterly" → "the manual full sweep; the daily `/api/cron/catalog` re-checks due rows (N24)".
- [ ] **Step 4:** PASS; suite, typecheck, scripts tsc as Task 5.
- [ ] **Step 5 (jiraiya):** `feat(catalog): seed staggers checked_at over 7 days and gates on catalogProblems` (body: link-check now uses checkCourseLink, never revives dead) — Revert-note: seed again writes no checked_at, doc_kind or is_overview.

### Task 7: Docs + corpus-health line

**Files:** `CLAUDE.md`, `tests/structure/cron.test.ts`, `docs/product/specs.md`, `docs/notifications.md`, `README.md`, `lib/catalog/courses.ts` (header comment ONLY), `prisma/schema.prisma` (one `///` comment ONLY), `scripts/catalog/corpus-health.ts`, `PENDING.md`

- [ ] **Step 1:** in `tests/structure/cron.test.ts` with `row = (n) => sourceOf("CLAUDE.md").split("\n").find(l => l.startsWith(\`| ${n} |\`))!`: "N24 names lib/services/cron.ts and every cron path" (includes `` "`lib/services/cron.ts`" `` and each `` `\`${path}\`` ``); "N23 no longer claims to be the only scheduled path" (no `"only scheduled path"`, includes `"(N24)"`).
- [ ] **Step 2:** FAIL (`row("N24")` undefined).
- [ ] **Step 3 edits:**
  - CLAUDE.md N23 last sentence → "Its sender runs on the product's clock (N24)." New N24 row after N23 — rule: "Scheduled work is a closed list kept in `lib/services/cron.ts` (`CRON_JOBS`): `/api/cron/reminders` (F29, every 5 min) and `/api/cron/catalog` (F8, daily link re-check against a 7-day TTL). Each is scheduled by `pnpm db:schedule` and listed by name in middleware. Each checks the shared Bearer `CRON_SECRET` before reading anything, claims a row before acting on it, stops before its own deadline, makes no model call, writes no user-authored row, and logs counts only. Anything that can be settled on read is settled on read; a new entry must say why it cannot." Why: "A clock is code that runs with nobody watching. Each one is a standing cost and a standing risk, so each is named, bounded and justified."
  - §8 Jobs row: "None in v1 — inline + streaming. Scheduled work is N24's closed list (F29 reminder sender every 5 min; F8 catalog link re-check daily), both called by Supabase pg_cron (`pnpm db:schedule`), not Vercel Cron — one scheduler keeps one list, and Hobby is daily-only."
  - §10: `cron/` line → `reminders (F29) · catalog (F8) — Bearer CRON_SECRET, N24`; under `services/` add `    cron.ts                  N24 closed list of scheduled jobs · cronAuthorised`; `learning/` description gains `· refresh-catalog (daily link re-check)`; `scripts/db` "reminders schedule" → "cron schedule (N24)".
  - specs.md F8: after the "Corpus (N8)" paragraph add **Lanes** (from `docs/superpowers/specs/2026-10-25-learning-watch-read-design.md` and `lib/domain/lanes.ts`: Watch = video/course, Read = doc/roadmap/repo; `MAX_PER_LANE` 3; per-lane cap from `courses` quota via `perLaneCap`; one primary per gap; `cappedLanes` copy; oEmbed for videos) and **Freshness** (`checked_at` TTL stamp, status = verdict; daily `/api/cron/catalog` re-checks ≤150 active rows stamped ≥7 days ago, oldest first; only GET 404/410 or oEmbed 400/404 is dead → `active → dead` + unscoped rebuild; blocked/live stay active; dead stays dead until a curator fixes `courses.ts` and re-seeds; seed staggers over 7 days; best effort, `pnpm check:corpus` reports overdue30; `pnpm check:links` manual full sweep).
  - specs.md F29: "the one clock in the product" → "one of the product's clocks (N24)"; "Nothing else in the product moved onto this clock …" → "The only other clock is F8's daily catalog re-check (N24); parked analyses (F19), plan lapse (F23) and listing expiry (F22) are still settled on read."; route list "the one clock" → "N24", add `GET|POST /api/cron/catalog            → RefreshSummary      // F8, Bearer CRON_SECRET; N24, daily`.
  - docs/notifications.md §3: `pnpm db:schedule` installs both N24 jobs (`roleform-round-reminders` every 5 min, `roleform-catalog-refresh` daily 03:17 UTC); `--remove` removes both.
  - README: `check:links` "When" → "manual full sweep (the daily cron re-checks due rows)"; `cron["app/api/cron/*<br/>reminders · catalog<br/>Bearer CRON_SECRET (N24)"]`; `pgcron["pg_cron<br/>every 5 min · daily"]`; add edge `cron --> learning`.
  - courses.ts header "On verified_at": replace the "`pnpm check:links` re-runs the same check quarterly" sentence with: a daily job (`/api/cron/catalog`, N24) re-checks rows whose `checked_at` is ≥ 7 days old and marks conclusive 404/410 dead; a dead row stays dead until fixed here and re-seeded; `pnpm check:links` is the manual full sweep. Touch no entry.
  - schema.prisma: replace only the two `///` lines above `checkedAt` with ``/// When a re-check last claimed this row — the TTL stamp; `status` carries the verdict.``, keep the `verifiedAt` distinction line. ⚠ No model/field/type/attribute/@map change. ⚠ Never `prisma migrate dev`. `pnpm db:generate` allowed. Verify `git diff prisma/schema.prisma` shows only `///` lines.
  - corpus-health.ts after metric 4: `overdue = db.course.count({ where: { status: "active", checkedAt: { lt: daysBefore(new Date(), OVERDUE_DAYS) } } })`; push `{ name: "Link re-checks overdue (>30 days)", value: \`${overdue} active course(s)\`, ok: overdue === 0, meaning: "The daily /api/cron/catalog re-check is behind or not running. Check cron.job_run_details." }`.
  - PENDING.md: add `- [ ] Seed should mark rows absent from COURSES as \`quarantined\` (pre-existing gap; today a removed entry stays active until a re-check finds it dead)`; strike this plan's Task 7 and the two superseded carried-over lines (watch-read Task 8 and Task 9).
- [ ] **Step 4:** `pnpm vitest run tests/structure` (claude-md and cron) green; suite + typecheck green.
- [ ] **Step 5 (jiraiya):** `docs(catalog): N24 closed list of scheduled jobs; F8 lanes and freshness` — Revert-note: docs and one CLI metric only; no migration.

## Review focus for neji

1. `prismaRefreshStore` line by line (no test runs it): claim `where` has `status: "active"` and `checkedAt: { lte: cutoff }`; `markDead` is `updateMany` with `status: "active"`; `hasSome` guarded against empty ids; `rebuild()` with no argument.
2. Microsecond trap: no code compares `checkedAt` for equality; seed always writes `checkedAt` on create.
3. Deadline arithmetic: claims stop at 200 s; worst check ~40 s (HEAD + GET 20 s each); 5 in flight; then unbounded rebuild + overdue count must fit `maxDuration` 300 and pg_net 290 s — is rebuild runtime known?
4. Seed `--skip-link-check` update path writes neither `status` nor `checkedAt` but still `docKind`/`isOverview`; CHECK `courses_doc_needs_kind` vs `catalogProblems`.
5. Logs and bodies: 401 body fixed "unauthorised"; failed rebuild logs `rebuilt=failed` without the error; reminders route behaviour byte-identical after the move.
Also flag, non-blocking: the seed never writes `author` (bundles fall back to `provider`).

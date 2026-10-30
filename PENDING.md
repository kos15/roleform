# PENDING.md — Roleform

Every piece of pending work lives here, and only here.

**Format.** `- [ ] item` while open. When the commit that finishes it lands, the same commit
changes the line to `- [x] ~~item~~ — <YYYY-MM-DD>` (the commit is `git log -S "~~item~~"`; a commit cannot name its own sha). Lines are never deleted —
the struck list is the record. New work gets its line *before* its first failing test.

---

## Systematic layout + TDD — `docs/superpowers/plans/2026-10-26-systematic-layout-and-tdd.md`

- [x] ~~Task 1: Vitest harness, PENDING.md, test-first policy~~ — 2026-10-26
- [x] ~~Task 2: Port the offline fixture scripts to Vitest~~ — 2026-10-26
- [x] ~~Task 3: Tested module-move codemod~~ — 2026-10-26
- [x] ~~Task 4: AI provider (`openai/`), checkers (`typesafe/`), `services/` folders~~ — 2026-10-26
- [x] ~~Task 5: Split system prompts into `lib/ai/system-prompts/`, byte-identical~~ — 2026-10-26
- [x] ~~Task 6: Per-agent user-prompt builders in `lib/ai/prompts/`~~ — 2026-10-26
- [x] ~~Task 7: `lib/services/` and `lib/shared/`~~ — 2026-10-26
- [x] ~~Task 8: Scripts layout (`scripts/db`, `catalog`, `ops`)~~ — 2026-10-26
- [x] ~~Task 9: Docs under `docs/product/`, CLAUDE.md §10 drift guard~~ — 2026-10-26
- [x] ~~Task 10: Carry over pending work from earlier plans, final verification~~ — 2026-10-26

## Agent team — `.claude/agents/`

- [x] ~~Six Naruto-named project agents (ino · hokage · shikamaru · kakashi · neji · jiraiya), pinned by `tests/structure/agents.test.ts`, documented in CLAUDE.md §16~~ — 2026-10-26

## Catalog refresh — `docs/superpowers/plans/2026-10-26-catalog-refresh.md` (branch `feat/learning-catalog-refresh`)

- [x] ~~Task 1: pure `lib/domain/catalog-refresh.ts` (TTL, `isDue`, `nextStatus`)~~ — 2026-10-26
- [ ] Minor: `lib/domain/catalog-refresh.ts` — drop the no-op `void current;` (repo convention is an `_`-prefixed unused param) — neji, Task 1 review
- [x] ~~Task 2: `lib/services/cron.ts` (`cronAuthorised` moved, `CRON_JOBS`) + `tests/structure/cron.test.ts`~~ — 2026-10-26
- [x] ~~Task 3: `refreshDueLinks` in `lib/services/learning/refresh-catalog.ts`~~ — 2026-10-26
- [ ] Minor: T13 in tests/services/learning/refresh-catalog.test.ts is a tripwire only — misses `data: { url }` shorthand, spreads, `type`/`qualityScore` writes
- [ ] Minor: `bundlesNamingNonActive` loads every non-active id (grows forever since dead is permanent) — switch to an EXISTS join if dead rows reach thousands
- [ ] Measure one real `rebuildBundles()` at the phase gate (estimated 3–10 s, ~290 sequential round trips; refresh budget assumes ≤ ~50 s)
- [x] ~~Task 4: `/api/cron/catalog` route + middleware + `CRON_JOBS` entry~~ — 2026-10-26
- [ ] Minor: tests/structure/cron.test.ts first-statement guard checks a function named `handle` but not that GET/POST export it — neji, Task 4 review
- [ ] Minor: tests/app/cron-catalog.test.ts throw-test title says 'count-free log' — it asserts an error-free log — neji, Task 4 review
- [x] ~~Task 5: `scripts/db/schedule.ts` schedules every `CRON_JOBS` job~~ — 2026-10-26
- [ ] scripts/db/schedule.ts: `vault.update_secret(id, secret)` keeps production's old description — pass name + 'Bearer token for /api/cron/* (N24)' (verify against a non-production DB) — neji, Task 5 review
- [ ] scripts/db/install-schedule.ts: unschedule-then-schedule per job is not atomic and now runs on EVERY production deploy — a dropped connection between the two leaves that job unscheduled (deploy fails loudly; old deployment keeps serving). Fix: drop the unschedule (pg_cron ≥ 1.3 `cron.schedule(name, …)` replaces by name — atomic per job) or wrap in `sql.begin`; verify against a non-production DB — neji, Task 5 review
- [ ] Minor: tests/services/cron.test.ts picks jobs by index — find by name — neji, Task 5 review
- [x] ~~Task 6: seed stagger + checkCourseLink + catalogProblems gate; link-check alignment~~ — 2026-10-26
- [ ] Seed: a link the seed itself finds dead is skipped and stays `active` in the DB until the cron re-checks it (≤7 days) — on a dead verdict, `updateMany({ where: { url, status: "active" }, data: { status: "dead", checkedAt: today } })` (pre-existing) — neji, Task 6 review
- [x] ~~Seed `--skip-link-check` still stamps `verifiedAt: today` on rows it never checked (pre-existing; plan kept it) — neji, Task 6 review~~ — 2026-10-26
- [ ] Seed never writes `author`; bundles fall back to `provider` for diversity — neji, Task 6 review
- [x] ~~Task 7: docs — N24, §8, §10, specs F8/F29, README, notifications, courses.ts header, schema `///`, corpus-health overdue30~~ — 2026-10-26
- [ ] /api/cron/reminders has no claimUntil deadline — relies on maxDuration 60 / pg_net 55 s (N24 wording now says so) — neji, Task 7 review
- [ ] Seed should mark rows absent from COURSES as `quarantined`
- [ ] A live re-seed returns `quarantined`/`stale` rows to active (recorded in a seed comment) — revisit if quarantine becomes a deliberate curator verdict; pairs with the 'mark rows absent from COURSES quarantined' item — neji, final review
- [ ] Death is decided by one 404/410 (or oEmbed 400/404) from a Vercel IP — a host that 404s datacenter IPs would quietly shrink the catalog; watch the `dead=` count in `[cron:catalog]` logs — neji, final review
- [ ] Spec F8 could state the seed's full write rule: a blocked re-seed re-stamps checked_at but never changes status; --skip-link-check writes neither — neji, final review

## Deploy-time sync — `docs/superpowers/plans/2026-10-26-deploy-time-sync.md` (branch `feat/deploy-time-sync`)

- [x] ~~Task 1: `scripts/deploy/gate.ts` (`isProductionBuild`, `skipLine`) + tests~~ — 2026-10-26
- [x] ~~Task 2: pure `lib/catalog/seed-rows.ts` (`catalogSeedRows`, `catalogHash`, `SEED_FORMAT`), `scripts/catalog/catalog-writes.ts`, manual seed writes from rows; `verifiedAt` stamped on update only on a live verdict~~ — 2026-10-26
- [x] ~~Task 3: `CatalogSync` model, migration `20261026000000_catalog_syncs` (hand-added CHECKs), `catalog_syncs` RLS on/no policy~~ — 2026-10-26
- [x] ~~Task 4: `pnpm deploy:catalog` — `syncCatalog` (hash gate, advisory lock, new-URL link check at concurrency 5, bundles, sync row last)~~ — 2026-10-26
- [x] ~~Task 5: `pnpm deploy:schedule` — `installSchedule` extracted to `scripts/db/install-schedule.ts`; `build` runs both deploy steps~~ — 2026-10-26
- [ ] First-ever concurrent production builds can both call vault.create_secret; the second fails on the unique name once — note only — neji, deploy-sync Task 5
- [ ] deploySchedule's `DATABASE_URL` fallback would hit pgbouncer prepared-statement errors if ever reached; unreachable in builds (migrate deploy needs DIRECT_URL first) — consider requiring DIRECT_URL — neji, deploy-sync Task 5
- [x] ~~Task 6: docs — N24 wording, new N25, §8 Jobs, §13 (policies run by every build, `CatalogSync`), README build order, `docs/notifications.md` §3/§5, specs F8 freshness, `.env.example` APP_URL~~ — 2026-10-26
- [ ] After the first production build: confirm the log shows `[deploy:catalog] synced …` (or `unchanged`) and `[deploy:schedule] scheduled …` for both jobs, then strike the two "After this branch deploys" lines (re-seed; db:schedule). Rows seeded before the lanes migration stay bunched on one `checked_at` until a manual full `pnpm seed:catalog` (plan Ruling 5)
- [ ] `catalog_syncs` CHECKs are unexercised (no local DB) — add bad inserts to `pnpm check:constraints`
- [ ] If egress is blocked or YouTube rate-limits, every new URL comes back `blocked` and is seeded unchecked (build passes; daily cron re-checks within 7 days) — consider failing the deploy when blocked > 50% of new URLs
- [ ] First production sync: `writeCourseSkills` only upserts — a course whose skill list shrank keeps its old course_skills link (pairs with the 'mark rows absent from COURSES quarantined' item; ~3 prod rows absent from COURSES stay active until the cron finds them)
- [ ] N24 sentence reads awkwardly to keep the test phrase 'which every production build runs' — reword together with its test

## Analysis journey dock (branch `feat/analysis-journey-dock`, 2026-10-30)

- [ ] `lib/domain/analysis-nav.ts`: one ordered list of analysis sections, path → section, prev/next, phone dock split, count phrasing — and the tab cards, dock and "Up next" card all read it
- [ ] Phone: inside a finished analysis the bottom bar carries that analysis's sections (current one always in a slot) + a More sheet with the rest and the way back out
- [ ] Desktop: a sticky compact section rail once the tab cards scroll away
- [ ] "Up next" step card at the foot of every section (Step n of m, back / next)

## Carried over

Audited 2026-10-26 against `git log` and disk. Earlier plans' finished tasks are ticked in their
own files; what is still open is here.

### GPT-5 agents + Jev checkers — `docs/superpowers/plans/2026-10-21-gpt5-agents-jev-checkers.md`

- [ ] Task 8: the gate — run evals on all three arms, set checker thresholds, measure p95 time and cost from `ai_runs`, `pnpm tokens:calibrate`, set `maxOutputTokens` to measured p99 × 1.3, record results in the agent-architecture spec §7 (needs live OpenAI + TypeSafe keys)

### Learning Watch | Read lanes — `docs/superpowers/plans/2026-10-25-learning-watch-read.md` (branch `feat/learning-watch-read`)

- [x] ~~Task 7: curate the remaining skill batches (done: JavaScript…Redux, RxJS…Elasticsearch, Data Modeling…Serverless + UX Research dead-link replacement; batch B open); finish when `pnpm check:catalog` exits 0 — now reports 375 entries · problems 24 (all batch B: React Native onward) · dead 0~~ — 2026-10-26 (`pnpm check:catalog` now exits 0: 447 entries · problems 0 · dead 0 · mismatches 0)
- [x] ~~Task 8: seed stagger + daily catalog refresh cron (`lib/catalog/refresh.ts`, `/api/cron/catalog`, 7-day TTL) — test-first in `tests/catalog/refresh.test.ts`~~ — 2026-10-26 (superseded and delivered by docs/superpowers/plans/2026-10-26-catalog-refresh.md Tasks 1–7)
- [x] ~~Task 9: docs — specs F8 lanes and refresh, CLAUDE.md N23 names `/api/cron/catalog`, `courses.ts` header~~ — 2026-10-26 (superseded and delivered by docs/superpowers/plans/2026-10-26-catalog-refresh.md Tasks 1–7)

### Layout review minors (final review of `chore/layout-tdd`, 2026-10-26)

- [ ] Stale `lib/...` paths in `.env.example`, `prisma/schema.prisma` `///` comments and `types/word-extractor.d.ts`; widen the CLAUDE.md drift test to scan them
- [ ] `lib/shared/email-hash.ts` is `server-only` but `shared/` is labelled client-safe — move it to `lib/services/` or relabel
- [ ] Tighten the "agents hold no prompt text" test: context values must be `prompt.<name>` imported from `../prompts/`
- [ ] Drift test: cover root files (`PENDING.md`, `middleware.ts`, `types/`); assert a tree child never sits under a file line
- [ ] Codemod: map `.js` specifiers to `.ts`/`.tsx`, add a `require("…")` form
- [ ] `scripts/server-only-stub.ts` header still says "used ONLY by scripts" — Vitest uses it too
- [ ] `.gitignore` lists `.superpowers/` twice
- [ ] CLAUDE.md §11: DOCX round-trip needs no DB/network/model — reword the rationale
- [ ] `tests/domain/push.test.ts`, `tests/domain/quotas.test.ts` read cwd-relative paths — use `ROOT`
- [ ] `lib/domain/guardrails.ts:5` says "the prompt in lib/ai/prompts" — means `lib/ai/system-prompts`

### Catalog batch A review minors (2026-10-26)

- [ ] Docker, Kubernetes, Terraform have 1 doc each — plan asks 2–3
- [ ] dbt, Snowflake, Google Cloud, Azure have 1 YouTube video each (a `course` fills the second Watch slot)
- [ ] Data Modeling, ETL, UX Research have no official doc (none exists — revisit if one appears)

### Catalog batch B review minors (2026-10-26)

- [ ] 21 entries still `type: "course"` but are text (Vitest Guide, Pro Git, OWASP Top Ten, 12factor, Refactoring Guru, Google eng-practices, scikit-learn Getting Started, Kaggle Learn, …) — retype to doc + docKind like batch B's seven
- [ ] Hugging Face LLM Course entry still carries the old NLP-course length (~15 hrs) — re-estimate
- [ ] Stakeholder Management Read: Kanda Software blog is vendor marketing — replace with a stronger non-vendor read when one is verified
- [ ] Optional: 'Why Engineers Need Product Thinking' (Product Driven, 9m) reads as an overview
- [ ] Vector Databases and Encryption, TDD, Technical Leadership, Stakeholder Management, Product Thinking have no official doc (no standards owner) — revisit if one appears

### Branch housekeeping

- [x] ~~DO NOT run `pnpm seed:catalog` until catalog-refresh Task 6 lands — the current seed writes no `docKind`, so every catalog doc would violate CHECK `courses_doc_needs_kind`~~ — 2026-10-26
- [ ] Re-seed the catalog once (`pnpm seed:catalog`) after this branch deploys: writes batch A/B entries, doc_kind/is_overview and the 7-day checked_at stagger — needs Node ≥ 20.19 locally
- [ ] After this branch deploys: `APP_URL=https://roleform.koustubh.org pnpm db:schedule` — installs `roleform-catalog-refresh` (daily 03:17 UTC); without it the catalog re-check never runs (neji, final review)
- [x] ~~Merge `feat/learning-watch-read` and `chore/layout-tdd` to `main` (this layout branch is cut from the watch-read branch)~~ — 2026-10-26
- [ ] Local Node is v20.17.0; `package.json` engines asks for >=20.19.0 — upgrade

# Systematic Layout + Test-Driven Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every kind of thing in the repo one obvious folder (OpenAI provider, TypeSafe checkers, system prompts, user prompts, AI services, server services, admin, shared), make every change test-first under Vitest, and track all pending work in one `PENDING.md` whose items are struck through when done.

**Architecture:** Pure refactor under green. First stand up Vitest and port the 12 offline `check:*` fixture scripts into `tests/` so behaviour is pinned. Then a tested codemod (`scripts/tools/move-modules.ts`) moves files and rewrites every import specifier repo-wide; each layout task is a move map + a structure test. Prompt splits are guarded by golden-hash tests written *before* the split, so no prompt byte changes (prompt versions and OpenAI prefix caching depend on that).

**Tech Stack:** Next.js 15, TypeScript strict, Vitest 3.2.4, tsx, pnpm.

**Spec:** The user's request (2026-10-26): *"very systematic structure of the project — a specific folder for all the items eg prompts, system-prompts, services, admin, openai etc. After that everything should be test driven from now, with all the pending items in a specific file and strike-out once completed."* The target layout below is the design; CLAUDE.md §10 is rewritten to match it in Task 9.

## Target layout

```
lib/
  ai/
    openai/          models.ts · run.ts · usage.ts        ← only home of @ai-sdk/openai
    typesafe/        jev.ts · requests.ts · verdict.ts · loop.ts · types.ts
                     · fabrication.ts · answer-claims.ts · injection.ts   (was ai/checkers/)
    system-prompts/  index.ts (SYSTEM, PROMPT_VERSIONS) · versions.ts · shared.ts (LAW, STYLE)
                     · one file per SYSTEM key · archive/v2.ts (SYSTEM_V2)
    prompts/         assemble.ts (was agents/prompt.ts) · one builder file per agent
    schemas/         unchanged
    agents/          wiring only: model, schema, guards, budget, checker
    services/        analyze-jd · answer · drill · extract-profile · interview
                     · synthesise-plan · tailor · transcribe   (was ai/*.ts)
  admin/             unchanged
  services/          account · extract · jobs · learning · mail · payments · pipeline · plans
                     · promo · push · status · auth.ts · features.ts · rate-limit.ts · workspace.ts
  shared/            utils.ts · email-hash.ts · sample-jd.ts
  domain/ catalog/ drill/ content/ seo/ render/ db/ supabase/ generated/   unchanged
tests/               mirrors lib/ (tests/domain/lanes.test.ts …) + tests/structure/
scripts/
  db/ catalog/ ops/ evals/ tools/   (+ env.ts, server-only-stub.ts at root)
docs/
  product/           PRD.md · specs.md · plan.md · planning.md · rules.md · agent.md
  learning-engine/   (was "learning recommendation engine/")
  superpowers/       unchanged
PENDING.md           the single pending-work list
```

## Global Constraints

- No behaviour change. Every prompt string byte-identical; every `PROMPT_VERSIONS` value unchanged.
- `lib/generated/**` is never moved or rewritten.
- `lib/domain/` imports nothing from `db`, `ai`, `supabase`, `services`, or `next` (CLAUDE.md §10 rule, now tested).
- `lib/supabase/admin.ts` imported only from server paths (CLAUDE.md §10 rule, now tested).
- Vitest pinned `vitest@3.2.4`. Tests live in `tests/`, named `*.test.ts(x)`, path mirrors the module under test.
- `PENDING.md` format: `- [ ] item` while open; on completion `- [x] ~~item~~ — <short sha>, <YYYY-MM-DD>`. Never delete a line.
- After every task: `pnpm typecheck` and `pnpm test` both green, PENDING.md line struck, one commit.
- DB-, network- and runtime-dependent checks stay as scripts (`check:constraints`, `check:catalog`, `check:drill`, `check:roundtrip`, `check:links`, `check:corpus`, `check:fabrication`, evals) — they are not unit tests.

## Review Focus

1. **Path strings the codemod cannot see** — `readFileSync`/`readdirSync` roots (token-copy gate scans `lib`/`app`/`components`; push test reads `public/sw.js`), package.json script paths, tsconfig include globs. Expect: still resolve. → Task 3 codemod reports non-import string literals containing a moved path; Task 8 structure test asserts every `pnpm script <path>` exists.
2. **`server-only` under Vitest** — moved server modules imported by tests throw outside Next. Expect: tests import them. → Task 1 aliases `server-only` to `scripts/server-only-stub.ts`; Task 2's agents test proves it.
3. **Client/server boundary after moving `push/client.ts` into `lib/services/`** — a `"use client"` file reaching a server module. Expect: build-time safety unchanged. → Task 7 structure test: no `"use client"` file and nothing under `components/` imports `lib/supabase/admin` or `lib/db`.
4. **Specifier forms** — `export … from`, `import type`, `import("…")`, `vi.mock("…")`, directory-index imports (`@/lib/ai/prompts` → `index.ts`). Expect: all rewritten. → Task 3 unit tests cover each form.
5. **Docs drift** — CLAUDE.md §10 naming paths that no longer exist. Expect: layout doc matches disk. → Task 9 structure test parses CLAUDE.md §10 and asserts each named `lib/`, `app/`, `scripts/` path exists.

---

### Task 1: Vitest harness, PENDING.md, TDD policy

**Files:**
- Create: `vitest.config.ts`, `tests/structure/harness.test.ts`, `PENDING.md`
- Modify: `package.json` (devDep `vitest@3.2.4`; scripts `test`: `vitest run`, `test:watch`: `vitest`), `CLAUDE.md` §11/§14/§15, `tsconfig.json` (no change expected — `**/*.ts` already includes `tests/`)

**Interfaces:**
- Produces: `pnpm test`; alias `@` → repo root, `server-only` → `scripts/server-only-stub.ts`; `environment: "node"`; `include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]`.

- [ ] **Step 1: Write failing test** `tests/structure/harness.test.ts`: `it("resolves @ alias and stubs server-only")` imports `@/lib/domain/lanes` and asserts `laneOf("video") === "watch"`; second `it` imports `@/lib/ai/agents/roster` (has `import "server-only"`) and asserts `AGENTS.length > 0`.
- [ ] **Step 2: Run** `pnpm test` → FAIL (`vitest` not found).
- [ ] **Step 3: Install** `pnpm add -D vitest@3.2.4`; write `vitest.config.ts` with the values above; add scripts.
- [ ] **Step 4: Run** `pnpm test` → 2 passed.
- [ ] **Step 5: Write `PENDING.md`** — header explaining the format rule (copy the Global Constraints line), section `## Systematic layout + TDD (docs/superpowers/plans/2026-10-26-…)` with one open line per Task 1–10, section `## Carried over` (filled by Task 10). Strike Task 1's line.
- [ ] **Step 6: Update CLAUDE.md** — §11 retitled "Verification policy — test-driven": every behaviour change starts with a failing test in `tests/`; `pnpm test` + `pnpm typecheck` green before every commit; the three phase-gate checks survive as scripts. Remove "no test suite" wording from §11, §12 ("Add automated tests if…" bullet deleted). §14 add: "All pending work lives in `PENDING.md`; strike items in the same commit that finishes them." §15 item 1: "Types check, `pnpm test` green."
- [ ] **Step 7: Commit** `chore(test): vitest harness, PENDING.md, test-first policy`

### Task 2: Port the offline fixture scripts to Vitest

**Files:**
- Create (one per script, `check()` → `it()`, `assert` kept as `node:assert/strict` or swapped for `expect` — implementer's choice, same assertions):
  `tests/ai/agents.test.ts` ← `scripts/agent-fixtures.ts`
  `tests/domain/coverage.test.ts` ← `coverage-fixtures.ts`
  `tests/domain/jd-segment.test.ts` ← `jd-strip-fixtures.ts`
  `tests/domain/job-triage.test.ts` ← `job-triage-fixtures.ts`
  `tests/domain/lanes.test.ts` ← `lanes-fixtures.ts`
  `tests/app/learning-lanes.test.tsx` ← `lanes-render-fixtures.ts`
  `tests/catalog/liveness.test.ts` ← `liveness-fixtures.ts`
  `tests/domain/primary.test.ts` ← `primary-fixtures.ts`
  `tests/domain/push.test.ts` ← `push-fixtures.ts`
  `tests/domain/quotas.test.ts` ← `quota-fixtures.ts`
  `tests/domain/selection.test.ts` ← `selection-fixtures.ts`
  `tests/structure/token-copy.test.ts` ← `token-copy-gate.ts`
- Delete: the 12 scripts above; their `check:*` entries in `package.json`.
- Modify: any doc/comment that names a deleted `pnpm check:*` (git grep each name; point it at `pnpm test`).

- [ ] **Step 1: Record baseline counts** — agents 46, coverage (count its cases), jobs 27, lanes 4, lanes-render 4, liveness 17, primary 10, push 36, quotas 31, selection 6, plus jd-strip and tokencopy case counts. Each ported file must have the same number of `it` cases (or more).
- [ ] **Step 2: Port one script per file**, run `pnpm test tests/<file>` → PASS each (these are characterisation tests over existing code; a FAIL means a porting error, not a code bug).
- [ ] **Step 3: Delete scripts + package.json entries; `git grep -n "check:agents\|check:coverage\|check:jdstrip\|check:jobs\|check:lanes\|check:liveness\|check:primary\|check:push\|check:quotas\|check:selection\|check:tokencopy"`** → only historical plan docs remain.
- [ ] **Step 4: Run** `pnpm test` → all green; `pnpm typecheck` → clean.
- [ ] **Step 5: Strike Task 2 in PENDING.md; commit** `test: port offline fixture scripts to vitest`

### Task 3: Tested module-move codemod

**Files:**
- Create: `scripts/tools/move-modules.ts`, `tests/scripts/move-modules.test.ts`
- Modify: `package.json` script `move`: `pnpm script scripts/tools/move-modules.ts`

**Interfaces:**
- Produces:
  - `type MoveMap = Record<string, string>` — repo-relative, extension-less for files (`"lib/ai/models"` → `"lib/ai/openai/models"`) or directory prefixes ending `/` (`"lib/ai/checkers/"` → `"lib/ai/typesafe/"`).
  - `rewriteSpecifier(importerOld: string, importerNew: string, spec: string, moves: MoveMap, exists: (p: string) => boolean): string | null` — PURE. Returns new specifier or `null` if unchanged. Resolves `@/…`, `./`/`../` relative to the importer's *old* path, and bare package specifiers → `null`. Output style preserved: `@/` stays `@/`; relative stays relative (recomputed from importer's *new* path, `./` prefix kept); index imports stay directory imports.
  - `rewriteSource(src: string, rewrite: (spec: string) => string | null): string` — PURE. Rewrites specifiers in `import … from "x"`, `import type`, `export … from "x"`, `import "x"`, `import("x")`, `vi.mock("x")`.
  - `strayPathLiterals(src: string, moves: MoveMap): string[]` — PURE. Non-import string literals containing an old path (Review Focus 1).
  - CLI: `pnpm move <map.json> [--dry]` — `git mv` each file, rewrite every `.ts/.tsx/.mjs` under `app components lib scripts tests middleware.ts` (excluding `lib/generated`, `node_modules`), print stray literals, exit 1 if any specifier resolved to a missing file.

- [ ] **Step 1: Write failing tests** in `tests/scripts/move-modules.test.ts`:
  - `@/lib/ai/models` from any importer, map `lib/ai/models→lib/ai/openai/models` → `@/lib/ai/openai/models`
  - `../models` from `lib/ai/agents/define.ts` (importer unmoved) → `../openai/models`
  - `./jev` from `lib/ai/checkers/injection.ts` moved with dir prefix `lib/ai/checkers/→lib/ai/typesafe/` → `null` (both moved together)
  - `../checkers/injection` from `lib/ai/agents/define.ts` → `../typesafe/injection`
  - `../lib/domain/lanes` from `scripts/x.ts` when importer moves to `scripts/ops/x.ts`, target unmoved → `../../lib/domain/lanes`
  - `@/lib/ai/prompts` (dir index) with `lib/ai/prompts/index→lib/ai/system-prompts/index` → `@/lib/ai/system-prompts`
  - `react`, `@prisma/adapter-pg`, `@/lib/generated/prisma/client` → `null`
  - `rewriteSource` rewrites all six syntactic forms in one fixture string and leaves a plain string `"lib/ai/models"` untouched
  - `strayPathLiterals('readdirSync("lib/ai/checkers")', map)` → `["lib/ai/checkers"]`
- [ ] **Step 2: Run** `pnpm test tests/scripts/move-modules.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** the three pure functions + CLI. Specifier scanning by regex over the six forms is enough (repo has no `require`); use `node:path` posix ops.
- [ ] **Step 4: Run** → PASS. `pnpm move <empty-map> --dry` → no changes, exit 0.
- [ ] **Step 5: Strike Task 3; commit** `chore(tools): tested codemod for module moves`

### Task 4: AI provider, checkers, services folders

**Files:**
- Create: `scripts/tools/maps/04-ai.json`, `tests/structure/layout.test.ts`
- Move (via `pnpm move`): `lib/ai/{models,run,usage}` → `lib/ai/openai/`; `lib/ai/checkers/` → `lib/ai/typesafe/`; `lib/ai/{analyze-jd,answer,drill,extract-profile,interview,synthesise-plan,tailor,transcribe}` → `lib/ai/services/`; `lib/ai/agents/prompt` → `lib/ai/prompts/assemble`

**Interfaces:**
- Produces: `tests/structure/layout.test.ts` with helpers `importsOf(file): string[]` and `filesUnder(dir): string[]` (reused by Tasks 5, 7, 8, 9).

- [ ] **Step 1: Write failing tests** in `layout.test.ts`:
  - `"@ai-sdk/openai is imported only under lib/ai/openai"` — scan all source files.
  - `"lib/ai has no loose files"` — `readdirSync("lib/ai")` contains only directories.
  - `"lib/domain imports no I/O layer"` — no specifier in `lib/domain/**` matches `/lib\/(db|ai|supabase|services)\b|^next/`.
- [ ] **Step 2: Run** → first two FAIL, third PASS.
- [ ] **Step 3: Write map, run** `pnpm move scripts/tools/maps/04-ai.json`; fix any stray literal it prints.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm test` → green. Update header comments in moved files that name their old path (e.g. `lib/ai/models.ts` comment references `lib/ai/checkers/jev.ts`): `git grep -n "lib/ai/checkers\|lib/ai/models\|lib/ai/run\b\|agents/prompt"` → fix.
- [ ] **Step 5: Strike Task 4; commit** `refactor(ai): openai/ typesafe/ services/ folders`

### Task 5: Split system prompts, byte-identical

**Files:**
- Create: `tests/ai/system-prompts.test.ts`, `lib/ai/system-prompts/{index,versions,shared}.ts`, one `lib/ai/system-prompts/<kebab-key>.ts` per `SYSTEM` key (12: extract-profile, transcribe-document, analyze-jd, tailor-bullets, tailor-summary, generate-questions, answer-question, synthesise-plan, revision-cards, quiz-round, coding-challenge, code-review), `lib/ai/system-prompts/archive/v2.ts`
- Delete: `lib/ai/prompts/index.ts`
- Modify: every importer of `@/lib/ai/prompts` / `../prompts` (agents) → `@/lib/ai/system-prompts` via codemod map `05-system-prompts.json` (`lib/ai/prompts/index→lib/ai/system-prompts/index`) run *before* splitting the file.

**Interfaces:**
- Produces: `SYSTEM: Record<SystemKey, string>`, `PROMPT_VERSIONS` (same keys/values), `SYSTEM_V2` exported from `archive/v2.ts` only; each per-key file `export const <camelKey> = \`…\``; `shared.ts` exports `LAW`, `STYLE`.

- [ ] **Step 1: Write the golden test first, against current code** — `tests/ai/system-prompts.test.ts` imports `SYSTEM`, `SYSTEM_V2`, `PROMPT_VERSIONS` from `@/lib/ai/prompts`, and asserts `sha256(SYSTEM[k])` equals a literal per key, same for `SYSTEM_V2`, and `PROMPT_VERSIONS` deep-equals the literal object. Generate the hash literals once with a throwaway one-liner and paste them.
- [ ] **Step 2: Run** → PASS (characterisation).
- [ ] **Step 3: Run codemod** `05-system-prompts.json`; change the test's import to `@/lib/ai/system-prompts` (and `SYSTEM_V2` to `@/lib/ai/system-prompts/archive/v2`). Run → FAIL on the `SYSTEM_V2` import until split.
- [ ] **Step 4: Split** the moved `index.ts` into the files above; `index.ts` assembles `SYSTEM` from the per-key exports, re-exports `PROMPT_VERSIONS`. Keep the long header comment in `index.ts`.
- [ ] **Step 5: Run** `pnpm test && pnpm typecheck` → green, all hashes equal.
- [ ] **Step 6: Strike Task 5; commit** `refactor(ai): system-prompts/ one file per prompt, byte-identical`

### Task 6: Per-agent user-prompt builders

**Files:**
- Create: `tests/ai/prompts.test.ts`, `lib/ai/prompts/<agent>.ts` for each agent in `lib/ai/agents/roster.ts` that has `staticContext`/`dynamicContext` (posting-reader, profile-reader, bullet-tailor, summary-tailor, question-writer, answer-writer, learning-planner, quiz-writer, revision-writer, challenge-writer, code-reviewer, document-transcriber, drill-prompt — confirm against roster)
- Modify: each `lib/ai/agents/<agent>.ts` to import its builders instead of inlining them

**Interfaces:**
- Produces: each `lib/ai/prompts/<agent>.ts` exports `staticContext(input: <Agent>Input): string` (only if the agent has one) and `dynamicContext(input: <Agent>Input): string`. Input types stay exported from the agent file; prompts import them with `import type`.

- [ ] **Step 1: Write the golden test first, against current code** — for each agent, build one fixture input (reuse inputs from `tests/ai/agents.test.ts` where present) and assert `sha256(assemblePrompt(agent, input))` equals a pasted literal.
- [ ] **Step 2: Run** → PASS.
- [ ] **Step 3: Extract builders** agent by agent; agent file keeps `staticContext: prompts.staticContext` wiring.
- [ ] **Step 4: Add structure test** to `layout.test.ts`: `"agents contain no prompt text"` — no template literal longer than 80 chars in `lib/ai/agents/*.ts`. Run → PASS.
- [ ] **Step 5: Run** `pnpm test && pnpm typecheck` → green.
- [ ] **Step 6: Strike Task 6; commit** `refactor(ai): prompts/ holds each agent's message builders`

### Task 7: `lib/services/` and `lib/shared/`

**Files:**
- Create: `scripts/tools/maps/07-services.json`
- Move: `lib/{account,extract,jobs,learning,mail,payments,pipeline,plans,promo,push,status}/` → `lib/services/<same>/`; `lib/{auth,features,rate-limit,workspace}` → `lib/services/`; `lib/{utils,email-hash,sample-jd}` → `lib/shared/`
- Modify: `tests/structure/layout.test.ts`

- [ ] **Step 1: Write failing tests** in `layout.test.ts`:
  - `"lib root holds only the agreed folders"` — `readdirSync("lib")` (ignoring `.DS_Store`) equals exactly `[admin, ai, catalog, content, db, domain, drill, generated, render, seo, services, shared, supabase]` plus `db/policies.sql` living inside `db/`.
  - `"no client file reaches admin or db"` — files under `components/` or starting with `"use client"` import nothing matching `lib/supabase/admin` or `lib/db`.
- [ ] **Step 2: Run** → first FAIL, second PASS.
- [ ] **Step 3: Run codemod** with the map; resolve stray literals printed (expect `middleware.ts` / comments).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm test` → green; `pnpm dev`, load `/` and `/pricing` → 200, no module-not-found in terminal.
- [ ] **Step 5: Strike Task 7; commit** `refactor: lib/services and lib/shared`

### Task 8: Scripts layout

**Files:**
- Create: `scripts/tools/maps/08-scripts.json`
- Move: `scripts/{apply-policies,schedule-reminders,smoke-constraints,grant-admin,convert-token-topups}` → `scripts/db/`; `scripts/{seed-catalog,rebuild-bundles,catalog-check,link-check,corpus-health,drill-bank}` → `scripts/catalog/`; `scripts/{app-icons,push-keys,indexnow,render-samples,docx-roundtrip,tokens-calibrate}` → `scripts/ops/`. `env.ts`, `server-only-stub.ts`, `evals/`, `tools/` stay.
- Modify: `package.json` script paths, `vitest.config.ts`/`tsconfig.scripts.json` only if paths change (they should not), `tests/structure/layout.test.ts`

- [ ] **Step 1: Write failing tests**: `"every package.json script path exists"` (regex `scripts\/[\w/.-]+\.ts` over each script value → `existsSync`) and `"scripts root holds only folders + env.ts + server-only-stub.ts"`.
- [ ] **Step 2: Run** → second FAIL.
- [ ] **Step 3: Run codemod; update package.json paths** (codemod does not touch JSON — edit by hand).
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck` → green; `pnpm check:catalog` (offline part) and `pnpm script scripts/ops/push-keys.ts --help`-style smoke → each starts without module errors.
- [ ] **Step 5: Strike Task 8; commit** `refactor(scripts): db/ catalog/ ops/ folders`

### Task 9: Docs layout + CLAUDE.md §10 drift guard

**Files:**
- Move (`git mv`): `PRD.md specs.md plan.md planning.md rules.md agent.md` → `docs/product/`; `learning recommendation engine/` → `docs/learning-engine/`
- Create: `tests/structure/claude-md.test.ts`
- Modify: `CLAUDE.md` (§10 replaced by the Target layout block of this plan, with each folder's one-line role; §14 `specs.md`/`plan.md` → `docs/product/…`), `README.md`, and every file `git grep -lE "specs\.md|PRD\.md|planning\.md|rules\.md|agent\.md|plan\.md|learning recommendation engine"` returns (31 today) — path mentions only, not `§` section references.

- [ ] **Step 1: Write failing test** `claude-md.test.ts`: extract every token in CLAUDE.md matching `/(?:lib|app|scripts|tests|docs)\/[\w./\[\]()-]+/` that has no `*`/`{` and assert `existsSync` (strip trailing `/`, try `.ts`/`.tsx`/`.sql`/`.md`). Also assert `docs/product/specs.md` exists.
- [ ] **Step 2: Run** → FAIL (old §10 paths like `lib/ai/checkers/`, docs not moved).
- [ ] **Step 3: Move docs, rewrite CLAUDE.md §10, fix references.**
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck` → green.
- [ ] **Step 5: Strike Task 9; commit** `docs: product docs under docs/, CLAUDE.md layout matches disk`

### Task 10: Carry over pending work, final verification

**Files:**
- Modify: `PENDING.md`; the three earlier plans in `docs/superpowers/plans/` (tick the checkboxes that are done)

- [ ] **Step 1: Audit** each earlier plan (`2026-10-21-gpt5-agents-jev-checkers`, `2026-10-21-pricing-without-tokens`, `2026-10-25-learning-watch-read`): for each `### Task`, find its deliverable on disk / in `git log`. Done → tick its boxes. Not done → one `- [ ]` line under `## Carried over` in PENDING.md naming plan + task.
- [ ] **Step 2: Verify** `pnpm typecheck && pnpm test` green; `pnpm dev` and click through profile → analyze → resumes/prep/learning tabs on local data; no module errors.
- [ ] **Step 3: Strike Task 10; commit** `docs: PENDING.md carries over unfinished plan work`

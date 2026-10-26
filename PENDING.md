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

## Carried over

Audited 2026-10-26 against `git log` and disk. Earlier plans' finished tasks are ticked in their
own files; what is still open is here.

### GPT-5 agents + Jev checkers — `docs/superpowers/plans/2026-10-21-gpt5-agents-jev-checkers.md`

- [ ] Task 8: the gate — run evals on all three arms, set checker thresholds, measure p95 time and cost from `ai_runs`, `pnpm tokens:calibrate`, set `maxOutputTokens` to measured p99 × 1.3, record results in the agent-architecture spec §7 (needs live OpenAI + TypeSafe keys)

### Learning Watch | Read lanes — `docs/superpowers/plans/2026-10-25-learning-watch-read.md` (branch `feat/learning-watch-read`)

- [ ] Task 7: curate the remaining skill batches (done: JavaScript…Redux, RxJS…Elasticsearch); finish when `pnpm check:catalog` exits 0 — today it reports 46 problems, 1 dead link, 4 blocked
- [ ] Task 8: seed stagger + daily catalog refresh cron (`lib/catalog/refresh.ts`, `/api/cron/catalog`, 7-day TTL) — test-first in `tests/catalog/refresh.test.ts`
- [ ] Task 9: docs — specs F8 lanes and refresh, CLAUDE.md N23 names `/api/cron/catalog`, `courses.ts` header

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

### Branch housekeeping

- [ ] Merge `feat/learning-watch-read` and `chore/layout-tdd` to `main` (this layout branch is cut from the watch-read branch)
- [ ] Local Node is v20.17.0; `package.json` engines asks for >=20.19.0 — upgrade

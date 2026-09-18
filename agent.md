# agent.md — Roleform · operating manual for F21–F25

For any coding agent implementing `PRD.md` in the order `planning.md` sets, under `rules.md`.
`CLAUDE.md` remains the contract for everything not covered here. The learning engine's own
manual (`learning recommendation engine/agent.md`) is the model this one follows.

---

## 1. Read first, in this order

1. `CLAUDE.md` §2, §3, §11, §13 — the law, the fabrication boundary, why constraints replace tests, the vocabulary.
2. `rules.md` — N13–N22 and the per-feature rule sets.
3. `PRD.md` §1.2 — the gap register; every id there is referenced by a task.
4. `planning.md` — the milestone you are on and its done-state.
5. The code the task touches, and its neighbour that already does the same thing: `lib/auth.ts` before any cap, `lib/domain/tokens.ts` + `components/token-wall.tsx` before the cap wall, `lib/learning/build-plan.ts` before any new pipeline seam, `lib/catalog/liveness.ts` before any outbound fetch.

Do not start a task whose done-state you cannot state in one sentence.

---

## 2. Invariants

| # | Invariant |
|---|---|
| I-A | `ai_runs` is flat across a roadmap build and a job search. |
| I-B | Every reader of a member's plan or caps goes through `effectivePlan` / the allowance functions. |
| I-C | Every provider response is Zod-parsed; every rendered listing URL is the provider's field. |
| I-D | Every cap has all nine homes (rules PAY-6). |
| I-E | Every new user-data table ships with RLS, CHECKs, a smoke case and a delete path in one PR. |
| I-F | Every `runStructured` call declares `maxOutputTokens` and at most one retry. |
| I-G | No model-written string reaches a row or a screen with a URL in it. |
| I-H | Nothing runs on a schedule. Expiry, cache expiry and lapse are settled on read. |

---

## 3. Module map — what goes where

```
lib/domain/                 PURE, no I/O
  roadmap.ts                compileRoadmap · roadmapProgress
  job-query.ts              buildJobQuery(profile) → JobQuery
  job-rank.ts               rankListings(listings, profileSkills)
  jd-segment.ts             stripBoilerplate(jdText) — the deterministic pre-strip
  entitlements.ts           + effectivePlan(row, now) · + capWall helpers
  quotas.ts                 + roadmaps, jobSearches
  guardrails.ts             + noUrls · scanTone split into odds/comparison vs deficiency
  tokens.ts                 + ANALYSIS_TOKEN_CEILING · estimates re-typed from calibrate
lib/jobs/                   SERVER — the I/O half of job search
  sources/types.ts          JobSource, JobQuery, JobListingIn, JobListingInSchema
  sources/adzuna.ts         one adapter; header comment carries terms, attribution, limits
  sources/jooble.ts         same
  search.ts                 fan-out, timeout, cache by query_hash, hit rows
lib/db/queries/
  roadmap.ts · jobs.ts      reads; every function takes clerkUserId first
lib/auth.ts                 + settlePlan · + checkCap(key) → Result<…, cap_wall>
app/actions/
  roadmap.ts                buildRoadmap · setRoadmapItemDone
  jobs.ts                   searchJobs · saveJob · setSavedJobStatus · unsaveJob
app/(app)/analysis/[id]/roadmap/    page.tsx · loading.tsx · item-row.tsx
app/(app)/jobs/                     page.tsx · loading.tsx · query-editor.tsx · results.tsx · saved.tsx
components/cap-wall.tsx             mirrors token-wall.tsx
scripts/tokens-calibrate.ts         pnpm tokens:calibrate
```

`lib/domain/` imports nothing from `db`, `ai`, `jobs`, `supabase` or `next`. If a function needs a
row, it takes the row.

---

## 4. Recipes

### 4.1 Adding a cap (used twice: `roadmaps`, `jobSearches`)

1. `prisma/schema.prisma`: column on `User` and `WorkspaceSettings`, default = Free's value.
2. Migration: CHECK bounds on both tables; backfill existing rows from `plan` (see `20260813140000_raise_existing_resume_caps`).
3. `lib/domain/quotas.ts`: `QuotaKey`, `QUOTAS` entry (label, unit, period, step, bounds, description).
4. `lib/content/pricing.ts`: value in each of `PLANS`, a line in `NOTES`.
5. `app/actions/admin.ts`: key in `CapsShape` (and therefore `DefaultsSchema`).
6. `lib/admin/defaults.ts`, `lib/auth.ts#provisionUser`, `app/api/webhooks/clerk/route.ts`, `app/api/webhooks/razorpay/route.ts#raisePlan`: write the column.
7. `lib/admin/members.ts`: `caps` and `used` gain the key; `usageFor` counts the rows.
8. `lib/auth.ts`: `checkCap(key)` counts rows since `cycleStart` and returns `cap_wall`.
9. `scripts/smoke-constraints.ts`: one out-of-bounds insert.
10. `specs.md` §6.2 and F17 table.

Grep for `capCourses` before you finish; every hit is a place the new key belongs.

### 4.2 Adding a user-data table

Schema → migration (hand-add CHECKs at the foot, commented) → `lib/db/policies.sql` `user_tables`
array (or the no-policy block for cache tables) → smoke case → `deleteEverythingFor` and
`deleteAccount` (cascade from `analyses` or `users` is fine; verify it) → `specs.md` §6.2.

### 4.3 Changing a prompt

1. Copy the current string to `SYSTEM_V1` (or the versioned key) — it stays for one release.
2. Write v2 under rules PR-1/PR-2. Remove any `.describe()` sentence the prompt now owns, and vice versa.
3. Bump `PROMPT_VERSIONS`.
4. Run three real analyses on preview; read `ai_runs` grouped by `prompt_version`; put the p50 delta in the PR body.
5. If the purpose is `tailor_bullet` or `tailor_summary`: `pnpm check:fabrication`, read all 30 by hand. Zero, or revert that prompt.

### 4.4 Adding a job source

1. Read the provider's terms. Write attribution text, rate limit and the date read into the adapter's header comment. No terms, no adapter.
2. Implement `JobSource`; parse with `JobListingInSchema`; map to `JobListingIn`. Drop and count what fails.
3. Register in `lib/jobs/search.ts` behind an env key (`ADZUNA_APP_ID` …). Unset means the source is off, silently, and the results view says which sources ran.
4. Never add a fetch outside `lib/jobs/sources/`.

### 4.5 A new enforcement seam

Copy the shape of `draftAnswer` in `app/actions/prep.ts`: `requireUser` → cheap validation → cache
or idempotency read → burst limit → `checkCap` → (token check only if a model is involved) → the
work → `revalidatePath`. Every query scoped by subject. The seam returns a `Result`, never throws.

---

## 5. Model routing

None of F21–F25 adds a call. The diet changes existing calls only:

| Purpose | Tier | maxOutputTokens | retries |
|---|---|---|---|
| extract_profile | strong | 6,000 | 1 (was 2) |
| analyze_jd | mid | 3,000 | 1 (was 2) |
| tailor_bullet | strong | 200 | 1 |
| tailor_summary | mid | 400 | 1 |
| interview_questions | strong | 3,500 | 1 |
| question_answer | mid | 2,500 | 1 |
| synthesise_learning_plan | strong | 2,500 | 1 |

Promoting a tier needs the golden-set delta written down (learning engine `agent.md` §5).

---

## 6. Never

- Never call a model from `lib/domain/`, `lib/jobs/`, a roadmap path or a job-search path.
- Never scrape. Never fetch a listing's target page. Never add a fetch outside `lib/jobs/sources/`.
- Never construct a listing URL; never render one that did not parse through the schema.
- Never send bullet text, a name, an email or a JD to a job provider.
- Never write `users.plan` outside the Razorpay webhook (up) and `settlePlan` (down).
- Never add a boolean feature flag per plan. A gate is a cap (N22).
- Never set `done_at` from anything but the user's tick.
- Never print a percentage or the word "ready" on the roadmap; never "match" on a listing.
- Never add a second retry, a backoff loop, or a call without `maxOutputTokens`.
- Never fix a bad model output by lengthening the prompt when a validator or a pure pre-step can fix it.
- Never add a scheduler, a cron or a queue to settle expiry, cache or lapse. Read-time settlement only (§8 of CLAUDE.md, D8).
- Never log a query, a title, a city, a listing, or any prompt text. Counts and hashes only (N7).
- Never ship a table without RLS, or a CHECK without a smoke case.
- Never write the count of anything into UI copy. Read it.

---

## 7. Verification per milestone

Light by design (CLAUDE.md §11). Look at the output; run the one-shot checks at the gate.

| Milestone | Run | Look |
|---|---|---|
| M8 | `check:constraints` (3 new cases) | Pay on preview, expire by hand, hit the wall; admin row reads "lapsed" |
| M9 | `check:fabrication` (★), `check:coverage` (pre-strip fixtures), `tokens:calibrate` | Three real runs per prompt version; read the drafts |
| M10 | `check:constraints` (roadmap case) | Build, tick, reload, delete a question, see its item go |
| M11 | `check:constraints` (jobs cases); R4 numbers in the PR | Search on Free (no network), on Pro (attribution shown), save, analyse, roadmap Apply bound |
| M12 | — | RLS re-check with two users across the four new user tables |

After every task: the walking skeleton — profile → paste JD → analyse → four tabs → preview →
both exports. Two minutes. It is the early-warning system.

---

## 8. Failure posture

- A job source that times out degrades to the other sources and says which one is missing. Zero sources → an honest empty state naming them, no cap row written.
- A roadmap compile with zero rows on a `ready` analysis → the tab says the analysis produced nothing to plan; no roadmap row, no cap consumed.
- A prompt v2 that fails the eval → that prompt reverts; the milestone still closes.
- A cap seam that cannot build its wall (no plan above, no admins) → still a `cap_wall`, with the reset as its only exit.
- On any failure: state what you expected, what happened, and the smallest experiment separating the top two causes. Two failed fixes on one symptom means the model of the problem is wrong — stop and re-derive (CLAUDE.md §14).

---

## 9. Commits and PRs

- One milestone per branch; one task or one recipe per commit; the done-state in the commit body.
- PR body carries: the tasks closed (ids from `planning.md`), the smoke-test count before/after, the token delta for any prompt change, and the docs updated.
- No model identifiers in commits, PR text or code comments.
- Docs drift is a bug: `specs.md`, `CLAUDE.md` §2, `README.md` and `.env.example` move in the same PR as the behaviour.

# planning.md — Roleform · M8–M12

Continues `plan.md` (M0–M7 shipped). Same principles: **riskiest first**, a thin path end to end,
then depth; one manual checklist per milestone at the gate, on a deployed preview; every task has
a verifiable done-state. Requirements are in `PRD.md`; the rules each task must obey are in
`rules.md`; how to work is in `agent.md`.

---

## Milestone map

```
M8   PAY        expiry · cap wall · two new caps · webhook · admin · pricing     ~4 days
M9   DIET       prompt v2 · output/run ceilings · input trimming · guard closure ~5 days
M10  ROADMAP    compile · tables · tab · tick                                   ~4 days
M11  JOBS       source spike · adapters · query · page · saved jobs · hand-off  ~6 days
M12  SURFACES   pricing/how-it-works copy · tour step · docs · RLS re-check     ~2 days
```

**Order, and why.** M8 first because M10 and M11 are plan-gated, and a plan that never lapses (G7)
is not a gate. M9 before the new surfaces because it touches every prompt and every call site; new
surfaces built on the old `runStructured` signature would be rewritten a week later. M10 before
M11 because the roadmap's Apply step is the seam the job search plugs into, and M10 is the cheaper
of the two to get wrong. M12 last because copy that promises a feature ships after the feature.

---

## The three assumptions that can kill this plan

Resolve before the milestone that depends on each. Each has a ≤ 1-day experiment.

| # | Assumption | If false | Experiment | Blocks |
|---|---|---|---|---|
| **R4** | Adzuna + Jooble return usable listings for Indian target titles | Job search reads as empty; a paid source (JSearch) becomes mandatory and the Pro margin changes | 20 title × city pairs from real profiles. Count listings with a working `url`. **Need ≥ 70% of pairs with ≥ 5 listings.** | M11 |
| **R5** | Prompt v2 keeps the fabrication eval at zero | The diet is reverted per prompt; the token target is missed for that stage | Run `check:fabrication` on v1 and v2 of `tailor-bullets` on the same 30 bullets. **Need zero fabrications on v2.** | M9 |
| **R6** | Settling lapse on read reaches every enforcement seam | A lapsed account keeps Pro caps at one seam and the page lies | List every reader of `users.cap_*` and `users.plan`; each must go through `effectivePlan`. **Need: grep finds no direct reader outside `lib/auth.ts` and `lib/admin/members.ts`.** | M8 |

---

## M8 — Pay

| # | Task | Done-state |
|---|---|---|
| M8.1 | Schema: `plan_expires_at`, `cap_roadmaps`, `cap_job_searches` on `users` and `workspace_settings`; CHECKs (bounds; `(plan='free') = (plan_expires_at IS NULL)`); backfill paid rows to `now() + 30d`, new caps from each row's `plan` | Migration applies on a copy of preview data; `pnpm check:constraints` gains three cases and all pass |
| M8.2 | `QUOTAS` gains `roadmaps` (cycle, 0–200, step 5) and `jobSearches` (cycle, 0–500, step 10); `PLANS` caps per PRD §4.1; `NOTES` for both | `/pricing` comparison table shows seven rows; admin panel edits both without a code change beyond `CapsShape` |
| M8.3 | `effectivePlan(row, now)` pure; `settlePlan` write-behind in `lib/auth.ts`; every allowance check and `listMembers` call it | R6 passes; a Pro row with a past expiry reads Free on the next action and the row is rewritten |
| M8.4 | Cap wall: `CapWall` value, `cap_wall` error code, `checkCap(key)` helper; analyses and answers migrated onto it | Every cap refusal on every seam carries `upgrade` where a plan above exists; the dialog renders from the value alone |
| M8.5 | Webhook: expiry extension on plan purchase; amount check; inbox row on mismatch; seven caps written | Paying twice yields one row, expiry 60 days out; a wrong-amount capture grants nothing and appears in `/admin?panel=inbox` |
| M8.6 | Renewal surfaces: profile panel "Pro until …", once-per-cycle renewal banner (5 days out), pricing CTA "Renew" on the current plan | Banner shows once, dismiss survives reload, does not show on Free |
| M8.7 | `deleteEverythingFor` / `deleteAccount` null `contact_messages.clerk_user_id` | Verified by a query after a test deletion |
| M8.8 | One `capsFromDefaults()` used by `provisionUser` and the Clerk `user.created` path (G19) | A raised workspace token default reaches an account created through either door |

**Gate.** Buy Pro on preview with a test key, set `plan_expires_at` to yesterday by hand, click
Analyse: the cap wall names Free's numbers and the plan exit. Then the RLS re-check on the two
tables (none yet — this gate is the pay checklist only).

---

## M9 — Diet and guard closure

| # | Task | Done-state |
|---|---|---|
| M9.1 | `runStructured` requires `maxOutputTokens`; every caller sets its purpose's ceiling (PRD §5.3) | Typecheck fails without it; `ai_runs` shows no call exceeding its ceiling |
| M9.2 | Analysis run ceiling (`TokenAccumulator`, 60k); overflow → remaining bullets verbatim, stage message says so | Fault-inject a 1,000-token ceiling on preview; the run completes, drafts exist, the parsing screen names the cut |
| M9.3 | Prompt v2 for all seven, old versions retained; `LAW` to one sentence; `TailoredBulletSchema` single object, no `rationale`; `.describe()`s trimmed | Each version bump measured: p50 input+output per purpose before/after, written into the PR |
| M9.4 | Input trimming: `answer` other-bullets → top 12 by overlap; `questions` bullets → ≤ 40 by coverage relevance; JD pre-strip (`lib/domain/jd-segment.ts`); floor 200 / ceiling 20,000 in one constant; `analyzeJd` retries 1 | Pre-strip never removes a line containing a requirement on the 10-posting fixture set (`check:coverage` extended) |
| M9.5 | IN-5 at `createAnalysis` (flag → `stage_state.injection`); IN-6 in ① before rows; `truncated` and the protected notice shown on the results header | A posting with "under 30" yields no such requirement row and one neutral notice; an injected posting is flagged and still runs |
| M9.6 | `noUrls` verify on every prose field of every schema; Prep gets odds/comparison tone check (not "deficiency") | A model output carrying `http` fails verify and takes one retry; "greatest weakness" questions still pass |
| M9.7 | Fabrication allowlist scoped to the bullet's role; seniority ladder matches titles only | `check:fabrication` zero; verbatim-fallback rate on the 30 bullets does not rise |
| M9.8 | `pnpm tokens:calibrate`; `TOKEN_STAGES` re-typed from its output; pricing "about N" derived | Estimates within 25% of measured p50 per stage (learning engine planning P5 rule) |

**Gate.** ★ Fabrication eval at zero on v2 (R5). Whole-run p50 recorded beside the old 20,000.
If any stage's v2 fails the eval, that stage reverts to v1 and the milestone still closes.

---

## M10 — Roadmap

| # | Task | Done-state |
|---|---|---|
| M10.1 | `lib/domain/roadmap.ts`: `compileRoadmap(rows) → items[]`, `roadmapProgress(items)`; pure | Called from a script with literal rows; sections omitted when empty; deterministic order |
| M10.2 | Tables `roadmaps`, `roadmap_items` with the kind/FK CHECK; RLS; smoke case; cascade from `analyses` | `pnpm check:constraints` rejects an item whose FK does not match its `kind`; RLS case passes |
| M10.3 | Actions: `buildRoadmap(analysisId)` (cap → `checkCap('roadmaps')`, compile, insert), `setRoadmapItemDone(itemId, done)` | Build writes one plan row, N items, zero `ai_runs`; second build on Free in-cycle returns `cap_wall` |
| M10.4 | Tab `/analysis/[id]/roadmap`, tab count `n/m`, hints from facts, deep links into the other tabs | Ticking survives reload; hint reads "Exported 12 Sep" from `exports` without ticking |
| M10.5 | Cross-links: Learning step rows and likely questions carry "On your roadmap" when an item exists | Deleting a question removes its item (cascade) |
| M10.6 | Walkthrough step 7 (`data-tour="roadmap"`) | Step renders only when the anchor exists |

**Gate.** Build a roadmap on a real analysis and work it end to end. Every item opens the thing
it names. `ai_runs` count before and after is equal. No "%" and no "ready" on the tab.

---

## M11 — Job search

| # | Task | Done-state |
|---|---|---|
| M11.0 | **R4 spike** — keys for Adzuna and Jooble; 20 title × city pairs; terms read, attribution and rate limits written into each adapter's header comment | ≥ 70% of pairs return ≥ 5 listings with a working `url`; decision on JSearch (D12) recorded |
| M11.1 | `lib/jobs/sources/{adzuna,jooble}.ts` behind `JobSource`; `JobListingInSchema`; timeout 8 s; ≤ 50 results | An adapter returning a malformed record drops it and counts it; never throws the search |
| M11.2 | `lib/domain/job-query.ts` (pure) and `lib/domain/job-rank.ts` (pure: skill overlap → recency → source) | Fixtures: a profile with no `targetTitles` falls back to the latest position; overlap chips list canonical names only |
| M11.3 | Tables `job_listings`, `job_search_hits`, `job_searches`, `saved_jobs`; `analyses.listing_id`; RLS (own rows on `saved_jobs`, `job_searches`; on with no policy for the cache); smoke cases | Cross-user read of `saved_jobs` denied; `applied` without `applied_at` rejected |
| M11.4 | Actions: `searchJobs(query)` (cap → `checkCap('jobSearches')`, burst limit, cache by `query_hash` 12 h), `saveJob`, `setSavedJobStatus`, `unsaveJob` | A repeat query within 12 h creates no `job_searches` row and makes no outbound call |
| M11.5 | `/jobs` page: query editor bound to `preferences`, results with attribution and overlap chips, saved jobs with status; Free sees the wall and makes no request | Network tab on Free shows zero calls to either provider |
| M11.6 | Analyse hand-off: `/analyze?listing=<id>` pre-fills the snippet with the notice; `createAnalysis` stores `listing_id`; the roadmap's Apply step binds to the saved job | An analysis started from a listing shows "From your saved job" on the results header |
| M11.7 | Nav: "Jobs" in the header and in the mobile sheet | Both render; `/jobs` is protected in `middleware.ts` |

**Gate.** From a real profile: search → save → analyse (paste the full posting) → build the
roadmap → tick Apply → status "applied". No listing URL was constructed by us; every one is the
provider's field. Logs for the session contain no title or city.

---

## M12 — Surfaces and docs

| # | Task | Done-state |
|---|---|---|
| M12.1 | Pricing: Pro tagline, refusal line, renewal copy (PRD §4.2, §4.6) | Every number on the page equals `PLANS`; no sentence describes a limit in words |
| M12.2 | How it works: a fifth block "Then the roadmap and the search", with refusals ("won't tick a step for you", "won't invent a listing link") | Renders signed out |
| M12.3 | `specs.md`: F21–F25 sections, §6.2 tables, §14 API surface, G17 correction; `CLAUDE.md` §2 gains N13–N22 from `rules.md`; `README.md` gains the two scripts and the two API keys in `.env.example` | Docs drift is a bug (CLAUDE.md §15.7) |
| M12.4 | Smoke test count updated in `specs.md` §12 | Number matches `scripts/smoke-constraints.ts` |

**Gate — the RLS re-check.** Two users, every new table: `roadmaps`, `roadmap_items`,
`saved_jobs`, `job_searches`. Neither reads the other's rows through the anon client. The cache
tables (`job_listings`, `job_search_hits`) are unreadable through it at all.

---

## Sequencing summary

```
M8 pay ──▶ M9 diet ──▶ M10 roadmap ──▶ M11 jobs ──▶ M12 surfaces
  4d          5d           4d             6d           2d          ≈ 3 weeks
```

If time pressure hits: ship M8 + M9 + M10 and hold M11 behind `capJobSearches = 0` on every plan.
A roadmap without job search is a complete feature; job search without the cap wall and the
expiry is a free feature nobody meant to give away.

---

## Deferred, and the trigger that would un-defer it

| Item | Trigger |
|---|---|
| Razorpay Subscriptions (D11) | Renewal rate < 50% after two cycles |
| JSearch adapter (D12) | R4 measurement < 70% |
| Auto-build roadmap at run end (D13) | Pro members ask |
| Export sweep at 90 days (G17) | The first scheduler, whatever brings it |
| Roadmap reminders (email/push) | Requires the same scheduler |
| Full-posting fetch for a listing | Never — that is scraping |

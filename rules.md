# rules.md — Roleform · rules for F21–F25

The non-negotiables for the roadmap, job search, plan changes, prompt diet and guardrail
closure. They extend `CLAUDE.md` §2 (N1–N12); numbering continues. Everything in `CLAUDE.md`
still applies unchanged. A rule here wins over a convenience in `PRD.md` or `planning.md`.

---

## 1. Non-negotiables

| # | Rule | Why |
|---|---|---|
| N13 | **No model call in the roadmap or the job search.** Both are pure functions over rows and one outbound API call. `ai_runs` does not move when either runs. | Request-time cost is billed on every run forever (N12). Neither feature needs a model, so neither gets one. |
| N14 | Every non-fixed `roadmap_items` row carries exactly the foreign key its `kind` names (CHECK). A step about a question points at that question. | A step that names nothing is a claim about work the user never generated. |
| N15 | `roadmap_items.done_at` is written only by the user's own tick. Nothing derived, scheduled or model-written sets it. | N3 applied: completion is a user-authored fact. Hints from rows are shown beside a step, never as a tick. |
| N16 | Roadmap progress is `n of m`. Never a percentage, never "ready", never a prediction. | N4 applied: a count is honest; a readiness score is a number nobody can source. |
| N17 | **Job listings come from documented APIs only.** No HTML scraping, no headless browser, no fetch of an employer's page, no source without terms read and recorded in its adapter. | Terms, brittleness, blocked egress, poster PII. If the source has no API, the product does not have that source. |
| N18 | Every provider response crosses the boundary through a Zod schema. A listing's `url` is the provider's own field; the app never assembles one. Bad records are dropped and counted, never coerced. | N6 and N8 for third-party data. A URL we built is a link we cannot vouch for. |
| N19 | A job query carries titles, canonical skill names, a city and a remote flag. **Never** a name, contact detail, bullet, résumé or JD. `JobQuery` has no field for them. | N7 at the egress. Wrong states unrepresentable. |
| N20 | Fit between a listing and the profile is **skill overlap**, shown as named skills. No number, no ring, no "match". | N4: the match score is coverage over a full posting; a snippet cannot earn it. |
| N21 | A paid plan has an expiry; Free has none (CHECK). Lapse is settled by one function on read. Nothing else lowers a plan, and nothing raises one except the webhook on a captured payment of the right amount. | A plan granted forever for one payment is the revenue bug; two writers to `users.plan` is the next one. |
| N22 | A plan **is** its caps: every plan-gated capability is a `QuotaKey` with a column, a CHECK, a `PLANS` value, a `NOTES` line and an enforcement seam that counts rows. No boolean feature flags per plan. | The pricing page prints `QUOTAS`; a gate outside it is a promise the page cannot show and the admin cannot move. |

---

## 2. Roadmap rules

- RM-1 Compile is pure (`lib/domain/roadmap.ts`), takes rows, returns items. No I/O.
- RM-2 Sections with no rows are omitted. Never a placeholder step.
- RM-3 Labels are snapshots of the user's rows or fixed keys. No free text from any other source.
- RM-4 Built on demand, one click, for every plan. The cap counts `roadmaps` rows in the cycle.
- RM-5 A roadmap outlives its cap: readable and tickable after a lapse.
- RM-6 Deep links point at the tab the step lives on. A step never re-renders another tab's content.

## 3. Job search rules

- JS-1 One adapter per source behind `JobSource`; adapters live in `lib/jobs/sources/`; nothing else calls a provider.
- JS-2 Per search: one call per enabled source, 8 s timeout each, ≤ 50 listings total. The action is the only caller.
- JS-3 Cap counted from `job_searches` rows (durable), plus `LIMITS.jobSearch` burst limit (12/hour).
- JS-4 A repeat of the same `query_hash` within 12 h reads the cache and writes no `job_searches` row.
- JS-5 `job_listings` and `job_search_hits` carry no user id and have RLS on with no policy. The pairing lives in `saved_jobs` only.
- JS-6 Attribution for every source with results, on every results view. Not optional per source.
- JS-7 Listing text is untrusted. When it becomes an analysis it gets the same IN-5 handling as a pasted JD.
- JS-8 Logs carry counts and `query_hash`. Never a title, a city, a company.
- JS-9 Free makes no outbound request. The wall is rendered from the cap, before any adapter is touched.
- JS-10 Saved jobs and statuses persist at any cap. `listing_id` is `ON DELETE RESTRICT` so a cached listing a member saved is never swept.

## 4. Pay rules

- PAY-1 Expiry extends from `greatest(now, current expiry)`. A second purchase never shortens a plan.
- PAY-2 `effectivePlan(row, now)` is pure and is the only way to read a member's plan. Direct readers of `users.plan` or `users.cap_*` outside `lib/auth.ts` and `lib/admin/members.ts` are a bug.
- PAY-3 Lapse writes Free caps back, the mirror of upgrade. Admin overrides do not survive a lapse (D10).
- PAY-4 Amount ≠ price: grant nothing, file an inbox row, answer 200. Never retry money.
- PAY-5 Every cap refusal is a `cap_wall` value with the exits in this order: the reset, the plan above, an admin. A refusal without a value is the generic error F15 removed.
- PAY-6 The two new caps join `QUOTAS`, `PLANS`, `NOTES`, `CapsShape`, `DefaultsSchema`, the webhook's `raisePlan`, `workspaceDefaults`, `provisionUser` and the Clerk webhook create path — all nine, in one change. A cap missing from any one of them is a cap that lies somewhere.
- PAY-7 Prices are constants in `lib/content/pricing.ts`. The browser never sends an amount.

## 5. Prompt rules

- PR-1 One home per instruction: shape in `.describe()`, behaviour in the system prompt, enforcement in the validator. Never two.
- PR-2 A line stays only if it changes first-attempt output. "Do not invent a URL" is a validator, not a sentence.
- PR-3 Every call declares `maxOutputTokens`. `runStructured` refuses to compile without it.
- PR-4 One corrective retry per stage. `retries > 1` needs a written reason in the call site.
- PR-5 Inputs are trimmed by pure ranking before the call: bullets by relevance, JD by boilerplate stripping. Never by a model.
- PR-6 A version bump per text change; the old version stays in the file for one release; the token delta is measured through `ai_runs` and written into the PR body.
- PR-7 The fabrication eval runs after every change to `tailor-bullets` or `tailor-summary`. Zero or revert.
- PR-8 Static text sits above the variable block. A variable token in the prefix is a prompt that is not cached.
- PR-9 A prompt is never expanded to fix a bad output that the pipeline or a validator should fix. Prompts grow monotonically and are billed forever.

## 6. Guardrail rules

- GR-1 A guardrail is code, never prompt wording alone. The prompt may say it too, only if PR-2 holds.
- GR-2 Input guards run cheapest first and before any model call. IN-5 and IN-6 run in `createAnalysis` and stage ①, not stage ⑤.
- GR-3 No model-written string may contain a URL. `noUrls` is applied by every caller of `runStructured` whose schema has a prose field.
- GR-4 Tone checks on Prep exclude the "deficiency" pattern. A real interview question may name a weakness; an answer may not compute odds.
- GR-5 The analysis has a run ceiling. Past it the product degrades to verbatim bullets and says so; it never stops writing rows it has paid for.
- GR-6 A guardrail that has never been watched rejecting something is not a guardrail. Every new CHECK gets a smoke-test case in the same PR.

---

## 7. Vocabulary (extends CLAUDE.md §13)

Fixed. Do not introduce synonyms.

`Roadmap`, `RoadmapItem` (never "task", "checklist item", "todo") · `JobSource`, `JobQuery`,
`JobListing` (never "job post", "posting" — *posting* is the JD text on an analysis), `SavedJob`,
`JobSearch` · `CapWall` beside `TokenWall` · `effectivePlan`, `settlePlan` · `planExpiresAt`.

A listing's `snippet` is what the provider returned; a `posting` is what the user pasted.

---

## 8. Definition of done (adds to CLAUDE.md §15)

8. No `ai_runs` row is written by a roadmap build or a job search.
9. Every new table has RLS in `lib/db/policies.sql`, a CHECK where a state is forbidden, a smoke-test case, and a delete path from `deleteEverythingFor`.
10. Every cap refusal returns a `cap_wall`; every cap appears in all nine places (PAY-6).
11. Prompt changes carry their measured token delta and a green fabrication eval.
12. `specs.md` §6.2, §14 and F21–F25 updated in the same PR as the behaviour.

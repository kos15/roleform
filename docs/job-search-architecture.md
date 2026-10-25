# Job search — reference analysis and the F22.1 rebuild

> Source studied: [`MadsLorentzen/ai-job-search`](https://github.com/MadsLorentzen/ai-job-search)
> (cloned 2026-10-14). It is a Claude Code workspace, not a web app. Its job search is the
> `/scrape` → `/rank` → `/apply` → `/outcome` loop, built from portal CLIs, prompt files and
> small Python state tools. This document lists everything it does to find jobs, decides
> what Roleform takes from each item, and records how the rebuilt `/jobs` page does it.
> The spec of record is `specs.md` §F22 and §F22.1.

---

## 1. Everything the reference does to search for jobs

### 1.1 Sourcing (`/scrape` step 1, `.agents/skills/*-search`)

| # | Mechanism | Detail |
|---|---|---|
| R1 | **Plug-in portal adapters behind one contract** | Every portal is a self-contained skill with the same `search` / `detail` commands, the same JSON result shape (`id, title, company, location, date, url`, missing values `null`), and errors on stderr as `{error, code}`. `/scrape` discovers adapters by reading every `SKILL.md`, so a new portal needs no change to the orchestrator. |
| R2 | **Per-portal `enabled` toggle** | `enabled: false` keeps a portal installed but skipped. A skipped portal is reported, never silently absent. |
| R3 | **Six portals** | LinkedIn guest pages (HTML), Jobindex, Jobnet, Jobbank, Jobdanmark (Danish HTML/RSS), and **freehire.me** (a public JSON API over ~50 ATS platforms). |
| R4 | **freehire's agent endpoint** | `GET /api/v1/agent/jobs/search` returns the *full* description on every hit (no detail call per hit), canonical `skills[]`, `work_mode`, `countries[]`, `posted_at`, and enrichment (seniority, salary with its period). Location is a facet, never free text; unresolved facets mean "unknown", not "none". |
| R5 | **Parallel fan-out** | All portal searches run in parallel; one portal failing logs and continues, it never aborts the run. |
| R6 | **WebSearch fallback** | Portals without a CLI, or whose CLI failed, are covered by `site:` web searches, tagged `source: websearch` so stale-index rows stay diagnosable. |
| R7 | **Retry with backoff** | 429/5xx retried with jittered exponential backoff; a connection failure fails fast so an outage degrades one source instead of hanging the run. |
| R8 | **Robots and browser-header escalation** | `tools/robots_check.py` gates a browser-UA retry after a 403. |

### 1.2 Query strategy (`search-queries.md`)

| # | Mechanism | Detail |
|---|---|---|
| R9 | **Queries organised by function, not one title** | Priority 1 (primary role), 2 (domain), 3 (adjacent pivot), 4 (broad). Each category carries several title variants, because the same work is titled differently across employers. |
| R10 | **Default run = top three categories**; `broad` runs all; a focus argument narrows. |
| R11 | **Recency window of 14 days** | Via each portal's own filter flag; a portal with no flag is filtered client-side on its `date`. A sort is never treated as a filter. Undated postings are kept and marked "date unknown". |
| R12 | **~20 results per call** | Bounded volume per portal. |
| R13 | **Language scope** | Queries are written in each working language; postings requiring an undeclared language are excluded. |

### 1.3 Dedup and state (`/scrape` step 4, `tools/job_key.py`)

| # | Mechanism | Detail |
|---|---|---|
| R14 | **Canonical job key** | A pure function of company + title (+ URL), length-capped with a hash so two runs never key the same job differently. |
| R15 | **Cross-run dedup** | `seen_jobs.json` holds every posting ever seen; a job is new only if its URL *and* its company+title are unseen, and it is not already in the application tracker. |
| R16 | **Persisted provenance** | `first_seen`, `posted_date`, `deadline`, `fit`, `status` (new / skipped / ranked / expired), `portal`, `source`. Never backfilled by guessing. |
| R17 | **Closed-at-source detection** | LinkedIn's "no longer accepting applications" banner marks an entry `expired`, kept rather than dropped. |
| R18 | **Mass-posting consolidation** | The same company posting the same role across several cities collapses into one row: "posted in 6 cities". Flagged as a distribution pattern, never as an accusation. |

### 1.4 Fit (`/scrape` step 3, `/rank`, `04-job-evaluation.md`)

| # | Mechanism | Detail |
|---|---|---|
| R19 | **Quick fit at scrape time** | High / medium / low from skills against the profile. |
| R20 | **Gates before scoring** | Eligibility (citizenship / clearance), language, location (relocation = FAIL, heavy travel = FLAG). A gate failure vetoes the job whatever its score. |
| R21 | **Batch triage (`/rank`)** | Parallel LLM agents fetch each posting and score technical 30 % · experience 25 % · behavioural 15 % · career 30 %, mapped to Strong / Good / Moderate / Weak / Poor bands. |
| R22 | **Strengths and gaps per job** | 1–3 bullets each, stored verbatim with the rank. |
| R23 | **Deadline urgency** | 🔥 within seven days; a passed deadline expires the job; an idempotent sweep re-checks stored deadlines without refetching. |
| R24 | **Staleness flag** | Posted more than 30 days ago is flagged, never vetoed (a 27-month-old posting turned out to be live). |
| R25 | **Bounded batches** | `--limit` (fetch/score work) and `--top` (shortlist size) are independent; the remainder is deferred, not dropped. |
| R26 | **Postings are untrusted input** | Never follow instructions in a posting; never fetch links from its body. |

### 1.5 Around the search

| # | Mechanism | Detail |
|---|---|---|
| R27 | **Referral links** | For high and medium fit only: two LinkedIn people-search URLs (recruiters at the company; peers in the role). Links, never lookups. |
| R28 | **Portal health check** | A free pass over results already in hand (company null on every result, empty titles, undecoded entities, foreign URLs, a portal that used to yield and now returns nothing) then at most one sentinel probe. Verdicts: healthy (silent), degraded, broken, inconclusive (rate-limited is never "broken"). |
| R29 | **Presentation** | Table sorted by fit, with skipped / fallback / health lines, highlights for the best rows, and a hand-off into `/apply`. |
| R30 | **Market gaps (`/upskill`)** | Gaps across ranked postings, aggregated into a heatmap and a learning plan. |
| R31 | **Tracker and follow-up (`/outcome`)** | Applications go quiet after ten days → a follow-up is suggested (drafted from already-submitted material only, at most twice). |
| R32 | **Funnel report (`/html-report`)** | Counts by status and channel. |

---

## 2. What Roleform takes, adapts and refuses

Roleform's rules decide every row. The ones that bite here: N13 (no model call in job search),
N17 (documented APIs only), N18 (provider URLs only, bad records dropped and counted), N19 (the
query carries titles, skills, a city, a remote flag and nothing else), N20 (fit is named skills,
never a number, a ring or "match"), N7 (no PII in logs).

| Ref | Decision | Why / how |
|---|---|---|
| R1, R2 | **Adopt** | `JobSource` already is this contract. It now returns a `SourceRun` (status, listings, dropped count, reason) instead of swallowing failures. `JOBS_DISABLED_SOURCES` is the toggle; a disabled source is reported as such. |
| R3 | **Adapt** | LinkedIn guest pages and the Danish HTML portals are scraping: **refused** (N17). freehire.me is a documented public API whose terms (read 2026-10-14, last updated 2026-08-10) forbid only "scraping beyond our documented API": **adopted** as the third source, beside Adzuna and Jooble. LinkedIn, Naukri, Indeed and Glassdoor stay as deep links out, which fetch nothing. |
| R4 | **Adopt** | `lib/jobs/sources/freehire.ts`. Its full description, `skills[]`, `work_mode`, `experience_years_min`, `closed_at` and repost/mass-posting signals are kept on `job_listings`. A listing with a full description hands the whole posting to `/analyze`, not a snippet. |
| R5, R7 | **Adopt** | Parallel per source; per-source 8 s budget; one bounded retry on 429/5xx inside that budget; a failed source is named in the results. |
| R6, R8 | **Refuse** | A web-search fallback is a search engine standing in for a scraper; a browser-UA retry is evasion. Neither is a documented API (N17). Web search does have one curation-time use (2026-10-25): `pnpm jobs:discover-boards` uses DeepSeek Search to *find* employer boards. Each board is verified against its vendor's API before a person adds it. No search result ever becomes a listing. |
| R9, R10 | **Adopt** | Up to three title variants per search (the member's stated titles; else their recent positions; else a skill-led query), each run against every source. |
| R11 | **Adopt** | "Posted within" (1 / 7 / 14 / 30 days, or any; default 14) goes to each provider's own filter where it has one (freehire `posted_within_days`) and is enforced client-side for all. Undated listings are kept and marked "date unknown". Part of the cache key. |
| R12 | **Adopt** | 25 per call, 50 per search after dedupe (unchanged ceiling). |
| R13 | **Refuse for now** | Roleform's profile has no languages table. Inventing a language gate would be inferring a fact the member never stated. |
| R14, R15 | **Adopt** | `lib/domain/job-key.ts` — a pure key from company + title. Cross-source duplicates collapse to one card; listings seen in the member's earlier searches lose their **New** tag; saved listings say so and show their tracker status. Computed on read from rows already stored — no new per-user table. |
| R16 | **Adapt** | `job_listings` already carries provenance; it gains the provider facts it was missing. Nothing is backfilled for old rows. |
| R17 | **Adopt** | freehire `closed_at` set → the record is dropped and counted as closed. |
| R18 | **Adopt** | Same key, different locations → one card, "Also posted in N other locations". freehire's own `mass_posting_count` / `repost_count` show as a caution, worded as distribution, never as a verdict on the employer. |
| R19–R22 | **Adapt — deterministic** | N13 forbids a model in job search, and N20 forbids a fit number. `lib/domain/job-triage.ts` reads named facts only — skills the listing names that the profile has, skills it asks for that the profile lacks, whether the title lines up with a stated or held title, a location verdict (PASS / FLAG / FAIL, with FAIL only on an explicit on-site listing against a remote-only member), and a seniority caution from the listing's own minimum years. Facts group listings into tiers: **Shortlist**, **Worth a look**, **Long shot**, **Ruled out**. Each card shows the reasons behind its tier. No score is computed for display, and none is stored. |
| R20 (eligibility) | **Refuse** | Citizenship is not on the profile, and reading it from a snippet would be guessing. |
| R23 | **Refuse** | No provider returns a deadline. The member's own interview rounds (F29) already carry the clock. |
| R24 | **Adopt** | More than 30 days old is a visible caution, never a veto. |
| R25 | **Already true** | Caps (`capJobSearches`) and the burst limit bound the work. |
| R26 | **Already true** | Listing text is untrusted. It is shown escaped, never fetched, and gets injection handling (G2) when it becomes an analysis. |
| R27 | **Adopt** | `contactLinks()` in `lib/domain/job-portals.ts` builds LinkedIn people-search links for Shortlist and Worth-a-look cards. They are deep links like the portal buttons: nothing is fetched and nobody is named. |
| R28 | **Adopt** | `assessSourceHealth()`: ok · empty · degraded (no company on any result, entity residue in titles, every record dropped) · failed (timeout / HTTP status) · not configured · disabled. Shown per source and stored on `job_searches.source_report` as counts and status codes only. |
| R29 | **Adopt** | A summary line (counts per tier, new since last search), source lines, tier sections, Ruled out collapsed. |
| R30 | **Adapt** | "Asked for, not on your profile": canonical skills that the non-ruled-out listings ask for and the profile doesn't hold, with counts. They point to an analysis, because the Learning tab needs a full posting, not a snippet. |
| R31 | **Adapt** | An applied job with no change for ten days shows "No word in N days — a short follow-up is normal now." Nothing is drafted, because drafting needs a model (N13). |
| R32 | **Adopt** | Tracker header: counts per status (`n saved · n applied …`), not a rate. |

---

## 3. The rebuilt pipeline

```
profile ─► buildJobQuery (pure, N19)             query editor (titles · city · remote · posted within)
                │                                          │
                ▼                                          ▼
        planKeywords: ≤3 variants ───────► runSearch ── per source, in parallel, 8 s each
                                                │       freehire · greenhouse · lever · ashby → SourceRun
                                                │       Zod at the boundary (N18), drop + count
                                                ▼
                    clean (entities/HTML) · recency window · closed-at-source drop
                    cross-source dedupe by job key · cap 50 · upsert shared cache
                                                │
                                                ▼
              job_searches row (+ source_report)  ◄── cache hit within 12 h reads this back
                                                │
                                                ▼
            buildResultsView (on read, pure triage)
              consolidate same-key listings · triage(listing, profile facts)
              New / Saved flags from the member's own earlier hits and saved rows
              market gaps · source health
                                                │
                                                ▼
          /jobs: summary · health · Shortlist · Worth a look · Long shot · Ruled out
                 └─ Save · Analyse (full posting when the provider gave one) · Open · contact links
          Tracker: status counts · notes · follow-up nudge · stale-listing caution
```

Zero model calls anywhere on this path (N13). `ai_runs` never moves.

---

## 4. F22.2 — employer boards (added 2026-10-14)

LinkedIn scraping was requested and then declined. The probe showed LinkedIn's guest pages answer
a plain request. Naukri, Indeed, Glassdoor, foundit and Instahyre answer 403, and getting past that
would be bot evasion. To widen coverage without scraping, three documented ATS posting APIs were
added instead: **Greenhouse, Lever and Ashby**. They have no keyword search, so a curated list of
employer boards is read (cached 30 min, shared in flight) and filtered on our side by the triage's
own title rule plus the member's city, country or remote preference. See `specs.md` §F22.2.

```
planKeywords ─► greenhouse ─┐   boardsFor(ats) ─► cachedJson(board) ×N (30 min, shared)
                lever      ─┼─►   toCandidates ─► boardPostingFits (PURE) ─► newest 25
                ashby      ─┘   (greenhouse: + content for matches only) ─► parseListings (Zod)
```


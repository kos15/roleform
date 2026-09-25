# PRD — JSearch as a job source, and described search

> Status: **built** on branch `feature/jsearch-job-source` · Sep 2026 · Resolves decision **D12**
> (PRD.md §3, specs.md). Extends F22 — Job search. Nothing here changes a non-negotiable:
> JSearch is a documented, keyed API (N17), makes no model call (N13), and the query that leaves
> the server is still titles, canonical skills, a city and a remote flag (N19).

---

## 1. Problem

Members asked for three things from `/jobs`, and the Adzuna + Jooble setup gives them only
partly:

| Need | Before | Why it fell short |
|---|---|---|
| **Real, current postings** | Adzuna + Jooble | Snippets only, not full descriptions. Neither covers LinkedIn or Naukri, where most Indian tech hiring is posted. |
| **Search by current skills** | The ranking already uses profile skills | Providers were queried with the first title only. A member with no target title got weak results. |
| **Search by role *or* a plain description** | A comma-separated titles box | No way to say "senior React developer in Pune, remote is fine". |

On top of that: **easy to run, free or close to it, and no extra servers**. The app runs on
Vercel and nothing else.

## 2. Options considered (summary)

| Option | Real postings | Skills / role / description | Maintenance | Cost | No servers |
|---|---|---|---|---|---|
| ScrapeGraphAI API | ⚠️ An LLM extracts apply links, so they can be invented | ✅ | ✅ | ❌ ~5 searches free, then about 100/month for $20 | ✅ |
| JobSpy (open source) | ✅ | ✅ | ❌ Breaks and gets blocked; LinkedIn needs proxies | Free + proxies | ❌ Needs a Python service |
| Apify actors (Naukri, LinkedIn) | ✅ | ✅ | ⚠️ Community-built, one per board | $5/month free credit | ✅ but slow (runs start a container) |
| SerpApi Google Jobs | ✅ | ✅ | ✅ | 250 free/month | ✅ |
| **JSearch (RapidAPI)** | ✅ Google for Jobs data, deduplicated, with the employer's own apply link | ✅ Free-text query plus country, remote and date filters | ✅ One adapter file | 200 free requests/month, then about $10–200/month | ✅ Plain HTTP |

**Chosen: JSearch**, added alongside Adzuna and Jooble. It is the only option that meets every
need without a server. It also keeps N17/N18 as they are, because the scraping happens on the
provider's side and the apply URL is the provider's own field.

## 3. Scope

### In

1. **JSearch adapter**: `lib/jobs/sources/jsearch.ts`.
   - Calls `GET https://jsearch.p.rapidapi.com/search` with `country` (default `in`), `date_posted=month`, and `work_from_home=true` when remote.
   - Uses one page (10 results) per search, which is one request; `JSEARCH_PAGES` can raise it to 3.
   - Keyed by `JSEARCH_API_KEY`. Unset means the source is off, and the results view says which sources ran.
   - Maps `job_id`, `job_title`, `employer_name`, city/state/country, `job_apply_link`, `job_posted_at_datetime_utc` and the salary fields.
   - The full description is kept, trimmed to 1,200 chars for the snippet, with the whole record stored in `raw`.
   - A record without an apply link fails the Zod schema and is dropped.
2. **Fan-out changes**: `lib/jobs/search.ts`.
   - JSearch is queried first.
   - Results are **interleaved** source by source before the 50-listing cap, so one source can't fill it.
   - **Duplicates across sources** (same title and company, normalised) are removed, and the first source's copy wins.
3. **Described search** (`lib/domain/job-intent.ts`, pure, no model): a sentence of up to 500 chars is parsed on the server into:
   - role titles: up to three words before a role noun, within one clause (e.g. "Senior React Developer")
   - keywords: canonical skills matched with the existing `skillsIn` catalog
   - a city: only after "in / at / near / based in"
   - a remote flag
   - Emails, phone numbers and links are removed before any matching.
   - The sentence itself is **never stored and never sent** anywhere.
4. **`JobQuery.keywords`**: skills the member typed, used only as provider search terms. The
   "Mentions N of your skills" chips still come from the profile's own skills (N20), so a typed
   skill is never presented as one the member has. `primaryTerms()` gives every adapter the same
   rule: first title, else the typed keywords, else the profile's top skills. This makes a
   skills-only search work too.
5. **UI** (`/jobs`):
   - A **By title / Describe it** switch.
   - A description box that explains what gets searched.
   - A **"Searched for: …"** line under the form, so the member can see how their sentence was read.
6. **Enum + migration**: `job_provider` gains `jsearch` (additive).
7. **Env**: `JSEARCH_API_KEY`, `JSEARCH_COUNTRY`, `JSEARCH_PAGES` (see `.env.example`).
8. **Fixtures**: `pnpm check:jobintent`.

### Out (for now)

- Pasting a job URL on Analyze to pull in its full description (possible later with a readability parser, then ScrapeGraphAI as a fallback).
- Apify or Naukri as a background top-up source. Revisit if the JSearch free tier runs out.
- Saving described searches or setting up alerts.

## 4. How a search flows

```
member → searchJobs({ titles | description, location, remote })          app/actions/jobs.ts
       → description? parseJobIntent() → titles, keywords, city, remote   lib/domain/job-intent.ts (pure)
       → JobQuery { titles, skills(profile), keywords, location, remote }
       → 12h cache hit?  → return, no request, no cap unit (JS-4, unchanged)
       → rate limit + cap check (unchanged)
       → fan-out, 8s each: jsearch · adzuna · jooble                      lib/jobs/search.ts
       → Zod parse → interleave → dedupe (source:id, title|company) → cap 50
       → upsert job_listings → rank by profile-skill overlap → job_searches + hits
       → view + "Searched for" echo
```

## 5. Guarantees kept

| Rule | How it holds |
|---|---|
| N13: no model call in search | The parser is a pure function over the skill catalog. `ai_runs` doesn't change. |
| N17: documented APIs only | JSearch is a keyed, documented API. Its terms, free tier and limits are in the adapter header. |
| N18: URL is the provider's own field | `url = job_apply_link`, never built by us. A missing link means the record is dropped. |
| N19: nothing personal leaves the server | Only titles, canonical skills, a city and remote are sent. Descriptions are cleaned of contact details, and the sentence isn't forwarded. |
| N20: fit is named skills | Chips come from the profile's skills only. Typed keywords are search terms, not claims. |
| JS-4: cache | `queryHash` now includes the typed keywords as well. |

## 6. KPIs

Take a baseline from the current Adzuna + Jooble runs before switching the key on. Review
weekly for the first month.

| KPI | Definition | Target |
|---|---|---|
| Zero-result rate | Searches with 0 listings ÷ all searches | < 10% (baseline first) |
| Listings per search | Median `result_count` | ≥ 15 |
| JSearch unique share | Listings only JSearch returned ÷ listings shown | ≥ 30% (shows it adds coverage) |
| Full-description share | Listings with a description over 600 chars | ≥ 40% |
| Dead-link rate | Open clicks landing on a closed or 404 page (manual sample of 50/week) | < 5% |
| Search → Save | Searches with ≥ 1 save ÷ searches | Up from baseline |
| Save → Analyse | Saved listings later analysed | Up from baseline |
| Described-search parse rate | Described searches that parsed to ≥ 1 title or keyword | ≥ 90% |
| Cache hit rate | Cached answers ÷ `searchJobs` calls | ≥ 30% |
| JSearch quota use | Requests per month ÷ plan limit | < 80% (alert at 80%) |
| Cost per search | Plan cost ÷ uncached searches | ₹0 on the free tier; review before upgrading |
| p95 search latency | All sources, uncached | < 8s |
| Model calls in search | `ai_runs` rows from `/jobs` | **0, always** |

## 7. Rollout

1. Get a RapidAPI key and subscribe to JSearch's free Basic plan. Set `JSEARCH_API_KEY` in Vercel **preview** first.
2. **Spike (1 hour):** run the 20 title × city pairs from planning.md R4. Record listings per pair, how many come from Naukri or LinkedIn, and latency. Pass condition: ≥ 70% of pairs return ≥ 5 listings with a working link.
3. Deploy. The migration adds one enum value and is safe to run on its own.
4. Turn it on in production. Watch quota use. With the 12h cache, 200 requests a month is enough for early Pro volume.
5. **Before paying for a plan:** if quota passes 80% two months running, compare JSearch's next tier with an Apify Naukri background top-up.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Free quota runs out mid-month | A 429 or other non-2xx means JSearch adds nothing, and Adzuna + Jooble still answer. Upgrade or add Apify when quota > 80%. |
| JSearch field names change | Mapping is defensive, every record goes through the Zod schema, and bad records are dropped and counted. |
| Parser misreads a sentence | "Searched for" shows exactly what ran. The member can switch to By title. Add the case to the fixtures. |
| Duplicates slip through (different title wording) | The key is title + company only. Tighten it if duplicates show up in practice. |
| Provider terms change | Terms are re-read at each plan change, and the date is recorded in the adapter header. |

# specs.md — Roleform

**Status:** Architecture draft v3 (design-reconciled + infrastructure fixed)
**Owner:** Kos · **Companion docs:** `CLAUDE.md`, `plan.md`

---

## 1. Problem

Tailoring an application per job is high-value and universally skipped, because it's roughly an hour
of work: reword the résumé, guess what they'll ask, notice what you're missing. Existing tools solve
the first third badly — they generate prose that invents experience the applicant can't defend in the
interview, and they sell an "ATS score" that measures nothing real.

**What is actually true about ATS**, which the product must be built on:

- An ATS is fundamentally a database. It parses a document into structured fields — name, titles, employers, dates, skills, education. Content it cannot map to a field effectively disappears.
- It does **not** auto-reject on format, length, or keyword count. Recruiters retain access to the original uploaded file. "ATS compliance" as sold by most tools is fearmongering.
- Parsing fidelity varies by platform. DOCX extracted more reliably than PDF in 6 of 8 tested systems; design-tool exports fare worst.
- Newer platforms layer semantic screening over keyword matching, which raises the value of genuine alignment and lowers the value of keyword stuffing.

**Roleform's actual job:** make the résumé parse cleanly, make the alignment genuine, tell the user
what they'll be asked and what they're missing — and never let them walk into an interview defending
a sentence they didn't write.

## 2. Spine

> Career facts live in one place. A posting is a lens that selects, orders, and rephrases them.
> It never invents them.

The design already says this in product copy: *"Nothing is invented — bullets are reordered, reworded
and re-weighted."* Everything below is that sentence, enforced.

## 3. Scope

**In scope (v1)** — all three output surfaces are core, not phased

- Onboarding: import a résumé (PDF/DOCX/TXT, ≤5 MB) → structured Master Profile, user-reviewed
- Per-analysis: JD via paste **or** file upload → posting metadata + requirements
- Coverage: Strong match / Partial evidence / Not evidenced, plus the match score (§6)
- **Tab 1 — Resumes:** up to eleven tailored drafts across eight template families, evidence-bound, with per-draft diff, preview, Compare two, Download all
- **Tab 2 — Prep:** twelve likely interview questions, four flagged most likely, tabbed by family (technical and system design get their own), each with why they ask, a three-point answer framework, the profile evidence to pull from, and a full worked answer on demand
- **Tab 3 — Learning:** skill gaps ordered by posting mention count, each with your level vs required, and two curated courses
- History of past analyses
- Export: DOCX + PDF per draft; zip for all

**Out of scope (v1)** — named so they don't creep in

- Cover letters · job scraping or auto-apply · recruiter/team accounts · mock interview practice with scoring · résumé marketplace · mobile apps · anything that writes experience the user did not state

## 4. Users and jobs-to-be-done

| Persona | JTBD | Success signal |
|---|---|---|
| **Active applicant** (primary) | "Apply to 15 roles without 15 rewrites, and walk in prepared" | 2nd analysis takes <3 min |
| **Passive switcher** | "Am I even close to this role?" | Reads score + gaps, closes the tab satisfied |
| **Career changer** | "Which of my experience maps to a field I haven't worked in?" | Finds transferable evidence they'd have omitted |

The career changer is the highest-value case and the one existing tools serve worst. A keyword
matcher tells them they're a 12% match; a coverage map tells them which three bullets are secretly
relevant, and the Learning tab tells them what to do about the rest.

## 5. Infrastructure

| Concern | Choice | Detail |
|---|---|---|
| Hosting | Vercel | Next.js 15 App Router; per-branch preview deploys |
| Auth | Clerk | Native Supabase third-party integration |
| Database | Supabase Postgres | Accessed via Prisma (`@prisma/adapter-pg`); RLS on every user table |
| File storage | Supabase Storage | Buckets `resumes` (private) and `exports` (private, signed URLs) |
| DNS / domain | AWS Route 53 · `koustubh.org` | App at `roleform.koustubh.org` (CNAME → Vercel) |
| CDN | Vercel edge (app) · CloudFront (`files.koustubh.org` → `exports` bucket) | See below |

### 5.1 Why CloudFront is *not* in front of the app

Vercel already runs its own edge network. Proxying the app through CloudFront adds a latency hop,
breaks ISR and cache invalidation, and makes preview deployments painful. The app subdomain points at
Vercel directly.

CloudFront's real job here is fronting the `exports` bucket so generated résumés serve from
`files.koustubh.org` under our own cache policy and TTLs, with the bucket itself never public.
Signed Supabase URLs remain the authorisation mechanism; CloudFront handles distribution and caching
only.

### 5.2 Environments

`production` (`roleform.koustubh.org`) · `preview` (Vercel branch URLs) · `local`.

Each gets its own Supabase project. **Preview never points at production data** — these are real
people's résumés, and a preview branch is not a safe place for them.

### 5.3 Clerk ↔ Supabase

Use the **native third-party auth integration**. The Clerk JWT-template approach was deprecated on
1 April 2025; the native path avoids fetching a fresh token per request and avoids sharing the
Supabase JWT secret with Clerk.

**Critical detail:** `auth.uid()` does not work with Clerk — it returns a UUID while Clerk subjects
are strings. RLS policies read the subject from JWT claims instead:

```sql
create or replace function public.clerk_user_id() returns text
language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::text
$$;

alter table analyses enable row level security;
create policy "own rows" on analyses
  for all
  using      (clerk_user_id = public.clerk_user_id())
  with check (clerk_user_id = public.clerk_user_id());
```

Consequences that propagate through the schema:
- `users.clerk_user_id` is `text`, not `uuid`. Everything joining to it is `text`.
- The integration supplies the `"role": "authenticated"` claim. Requests lacking it are anonymous and RLS denies them.
- The service-role key never reaches the client; it is used only in trusted server paths (Clerk webhooks, catalog seeding, admin scripts).
- Server Actions still scope every query by the session subject. RLS is the second lock.

**Two ways in, on purpose.** The marketing header and the landing hero open Clerk's *modal*, which
is right where the visitor is already reading something. `/sign-in/[[...sign-in]]` and
`/sign-up/[[...sign-up]]` are the routed pair, in the `(auth)` group with their own minimal chrome,
because three callers need a URL a modal cannot give them: Clerk's own bounce out of `auth.protect()`
(`NEXT_PUBLIC_CLERK_SIGN_IN_URL`), the checkout button returning a signed-out visitor to `/pricing`,
and any shared link. Both are public in `middleware.ts` and both land on `/analyze`, which holds the
"import your résumé first" state for a new account and the working screen for everyone else.

## 6. Data model

### 6.1 Canonical profile format

The Master Profile is stored as **JSON Resume schema v1.0.0** (`basics`, `work`, `education`,
`skills`, `projects`, `certificates`, `volunteer`, `awards`, `languages`) — a community-driven open
standard designed to be machine-readable for parsers and ATS-like tooling, with an existing validator
and theme ecosystem. Extensions are namespaced so the document stays valid and portable:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/jsonresume/resume-schema/master/schema.json",
  "basics": { ... },
  "work": [ ... ],
  "x_roleform": {
    "schemaVersion": 1,
    "bulletIds": { "work.0.highlights.0": "blt_9f2a" },
    "sensitivity": { "hidePhone": false, "hideAddress": true }
  }
}
```

Portability out of the product is a feature, not a leak.

### 6.2 Relational schema (Prisma / Supabase Postgres)

The JSON document is the *portable* form; the tables are the *operational* form — because N1/N2 need
real foreign keys, and JSONB cannot enforce them.

**Every table below carries `clerk_user_id text NOT NULL` and has RLS enabled** with the policy in
§5.3. Given the light verification policy (§12), these constraints are the primary safety net.

```
users
  clerk_user_id text PRIMARY KEY, email_hash, plan, created_at
  role enum('member','admin')        -- MIRROR of Clerk publicMetadata.role, not the truth
  suspended bool
  cap_analyses, cap_resumes, cap_answers, cap_courses int   -- F15, each CHECKed
  cap_roadmaps int CHECK 0..200      -- F23, per cycle
  cap_job_searches int CHECK 0..500  -- F23, per cycle
  plan_expires_at timestamptz null   -- F23. CHECK (plan = 'free') = (plan_expires_at IS NULL)
  quota_remaining int                -- superseded by cap_analyses; no longer read
  quota_resets_at timestamptz        -- anchors the rolling 30-day cycle

workspace_settings                     -- F15. Operator config, not user data. One row,
  id text PRIMARY KEY DEFAULT 'workspace'   -- CHECKed to that single value
  cap_analyses, cap_resumes, cap_answers, cap_courses int  -- same bounds as users, CHECKed
  cap_roadmaps, cap_job_searches int -- F23, same bounds as users, CHECKed
  updated_at timestamptz
  -- The caps a NEW account is provisioned with. RLS is ON with NO policy: no
  -- anon or authenticated request has business reading it, and the admin path
  -- goes over the Prisma connection, which bypasses RLS.
  -- capsFromDefaults() is the one function that reads this row into a new
  -- account's caps, used by both provisionUser and the Clerk user.created
  -- webhook path (G19) — a cap missing from that helper is a cap that lies
  -- on whichever door didn't go through it.

contact_messages                       -- F13. The one table whose subject may be NULL:
  id, clerk_user_id text NULL, name, email, subject, body, created_at
  notification, receipt mail_delivery   -- pending | sent | failed | disabled
  notified_at timestamptz NULL, delivery_error text NULL
  handled_at timestamptz NULL, handled_by text NULL
  -- the contact page is public, so a signed-out sender has no subject to key on.
  -- Those rows are written over the Prisma connection and read by the service
  -- role only; through the anon client the rule is own-rows as everywhere else.
  -- CHECK (handled_at IS NULL) = (handled_by IS NULL)  -- answered has an owner
  -- CHECK notification <> 'sent' OR notified_at IS NOT NULL  -- sent has a date

master_profiles
  id, clerk_user_id, resume_json (jsonb), schema_version,
  source_document_id → source_documents, years_experience, skill_count, updated_at
  -- drives the "Priya_Raman_Resume.pdf · Parsed · 6 yrs · 28 skills" card

experience_bullets                     -- ATOMIZED user facts. The evidence table.
  id, clerk_user_id, profile_id → master_profiles
  scope     enum('work','project','volunteer','education')
  scope_ref text                       -- 'work.1' — points into resume_json
  ordinal int, text text               -- verbatim as the user wrote it
  skill_ids uuid[], metrics jsonb, recency_months int

source_documents
  id, clerk_user_id, storage_path, bucket, mime, filename, size_bytes,
  extraction_status enum('pending','ok','no_text_layer','encrypted','failed'),
  extracted_text, created_at

analyses                               -- one JD run. The unit of History.
  id, clerk_user_id, profile_id
  jd_source enum('paste','upload'), jd_filename, raw_text
  content_hash text                    -- UNIQUE(clerk_user_id, content_hash) → dedupe, no double billing
  company, title, location, seniority, employment_type
  score numeric(5,2), score_verdict text, score_note text
  status enum('parsing','ready','failed'), created_at
  listing_id → job_listings null      -- F22 §3.5. Set when the run started as "Analyse" on a
                                       -- saved listing; the results header reads it to show
                                       -- "From your saved job" and the roadmap's Apply step
                                       -- binds to the same saved_jobs row through it.

jd_requirements
  id, analysis_id → analyses
  kind enum('hard_skill','soft_skill','experience','education','certification','responsibility')
  text, necessity enum('required','preferred','implied')
  mention_count int                    -- ★ drives Learning tab ordering
  skill_id uuid null → skills
  evidence_quote text                  -- the JD span this came from

coverage_items
  id, analysis_id, requirement_id → jd_requirements
  status enum('evidenced','partial','absent')
  evidence_bullet_ids uuid[], rationale text
  CHECK (status <> 'evidenced' OR array_length(evidence_bullet_ids,1) > 0)

templates                              -- seeded, not user data. No RLS; public read.
  id, name, kind enum('classic','sidebar','creative'), blurb, accent, structural_flags jsonb

resume_drafts                          -- one per template within capResumes
  id, clerk_user_id, analysis_id, template_id → templates, resume_json (jsonb),
  ats_rating enum('High','Medium','Low'), page_count, created_at

tailored_bullets                       -- ★ FABRICATION GUARD #1
  id, draft_id → resume_drafts
  source_bullet_id → experience_bullets   NOT NULL   ★ ON DELETE RESTRICT
  original_text, rewritten_text
  transform enum('verbatim','rephrase','requantify','omit')
  targets_requirement_id → jd_requirements null, ai_run_id → ai_runs

interview_questions                    -- ★ FABRICATION GUARD #2
  id, analysis_id, ordinal
  type enum('behavioral','technical','situational','gap','culture','system_design')
  text, likely bool, why_they_ask text, frame text[]
  evidence_bullet_ids uuid[], source_requirement_id → jd_requirements null
  CHECK (type = 'gap' OR array_length(evidence_bullet_ids,1) > 0)

question_answers                       -- worked answers, drafted on demand (F7.2)
  id, clerk_user_id, question_id → interview_questions UNIQUE, analysis_id
  headline text
  sections     jsonb  -- [{heading, body}]      general knowledge, no personal claim
  resume_hooks jsonb  -- [{bulletId, useIt}]    the ONLY first-person material
  follow_ups text[], key_concepts text[], ai_run_id → ai_runs null, created_at
  -- resume_hooks[].bulletId is validated against experience_bullets in the AI
  -- layer and again on read; a hook that loses its bullet is dropped, not shown.

skills                                 -- canonical vocabulary AND the taxonomy spine. Public read.
  id, name, category, aliases text[],
  slug UNIQUE, roadmap_path, parent_id → skills, depth int,
  volatility enum('low','medium','high')
  -- parent_id/depth are what make precomputation possible (F8). Set only by
  -- the seed script from lib/catalog/taxonomy.ts, never by hand.

skill_gaps                             -- one ranked gap. The unit F8 renders.
  id, clerk_user_id, analysis_id, skill_id → skills, requirement_id → jd_requirements
  user_level     enum('none','exposure','working','strong')
  required_level enum('exposure','working','strong','expert')
  mention_count int, note text, ordinal int
  severity        numeric(5,2)  CHECK 0..100
  importance      numeric(4,3)  CHECK 0..1
  evidence_credit numeric(4,3)  CHECK 0..1
  evidence_bucket enum('strong','partial','none')
  target_level    enum('intro','working','deep')
  jd_quote, why_it_matters text
  unlocks_bullet_id   → experience_bullets  ON DELETE RESTRICT
  unlocks_bullet_draft text
  answers_question_id → interview_questions
  fallback_url, fallback_label           CHECK (both null or both set)

learning_plans                         -- the solved sequence + S6's narrative
  id, clerk_user_id, analysis_id UNIQUE → analyses,
  opening, sequence_note, budget_min int null, total_min int,
  fallback_count int, resolution_rate numeric(4,3), ai_run_id → ai_runs null

learning_steps                         -- one resource, one gap, one plan slot
  id, clerk_user_id, plan_id → learning_plans, gap_id → skill_gaps,
  course_id → courses ON DELETE RESTRICT,
  ordinal int, starts_at_min int, duration_min int  CHECK (>=0, >=0, >0)
  entry_label, entry_url, note text
  unlocks_bullet_id   uuid → experience_bullets ON DELETE RESTRICT
  answers_question_id uuid → interview_questions
  -- Nullable. Set only by the deterministic binder, which returns null rather
  -- than something plausible. The guard that matters is on skill_gaps: a
  -- staged rewrite cannot exist without the bullet it rewrites (OUT-2).

courses                                -- CURATED catalog. Public read. Never model-generated.
  id, provider, title, url, price_label, length_label,
  level enum('beginner','intermediate','advanced'), mark text,
  skill_ids uuid[], is_free bool, verified_at date,
  type enum('course','video','doc','repo','roadmap'), author,
  published_at date, quality_score numeric(4,3), tags text[],
  status enum('active','stale','dead','quarantined'), corpus_version int

course_skills                          -- the join, built at ingest. The entry point lives here.
  course_id, skill_id, level, confidence, is_primary,
  entry_label, entry_url, summary       -- summary is the ONLY chunk-derived
  PRIMARY KEY (course_id, skill_id)     -- text that ever reaches a model (I2)

skill_bundles                          -- the precomputed answer cache
  skill_id, level, ranked_course_ids uuid[], entry_points jsonb,
  corpus_version, refreshed_at
  PRIMARY KEY (skill_id, level)         -- request-time retrieval is THIS lookup

unresolved_terms                       -- corpus growth: terms the resolver couldn't place
  id, normalised UNIQUE, term, seen_count, first_seen_at, last_seen_at
  -- No clerk_user_id, deliberately. The term is public content from a job
  -- board; the pairing with a person is what would be sensitive.

corpus_gaps                            -- ranked by count, this IS the ingestion backlog
  skill_id, level, count, last_seen_at
  PRIMARY KEY (skill_id, level)

exports
  id, clerk_user_id, draft_id, format enum('pdf','docx','zip'),
  storage_path, bytes, created_at

ai_runs                                -- ALSO the token meter's source of truth (F19)
  id, clerk_user_id, analysis_id, purpose, model, prompt_version,
  input_tokens, output_tokens, latency_ms, schema_valid bool, retry_count, created_at

token_grants                           -- one-off top-ups: bought, or granted by an admin (F19)
  id, clerk_user_id, tokens int CHECK (> 0),
  source enum('purchase','admin'),
  reference text UNIQUE,               -- payment id, or admin:<uuid>. THE idempotency guarantee.
  granted_by text, created_at

plan_purchases                         -- F23. The webhook's idempotency guarantee for PLAN
  id, clerk_user_id, plan enum('pro','ultra'),
  amount_paise int, reference text UNIQUE,   -- Razorpay payment id — mirrors token_grants.reference
  created_at
  -- Without this table a redelivered webhook re-extends plan_expires_at a
  -- second time for one payment (PAY-1's "never shortens" has no matching
  -- "never doubles" without it). token_grants covers top-ups; this covers
  -- the plan-purchase path the same way.

roadmaps                               -- F21. One per analysis, built on demand, zero tokens.
  id, clerk_user_id, analysis_id UNIQUE → analyses (cascade), created_at

roadmap_items                          -- F21. ★ FABRICATION GUARD, roadmap edition (N14)
  id, clerk_user_id, roadmap_id → roadmaps (cascade)
  key text, section enum('prepare','rehearse','deepen','learn','apply')
  ordinal int, label text
  kind enum('fixed','question','answer','learning_step','gap','saved_job')
  question_id → interview_questions (cascade) null
  learning_step_id → learning_steps (cascade) null
  gap_id → skill_gaps (cascade) null
  saved_job_id → saved_jobs (set null) null
  done_at timestamptz null             -- N15: written only by the user's own tick
  UNIQUE (roadmap_id, key)
  CHECK: exactly the FK that matches `kind` is set; `fixed` has none

job_listings                           -- F22. Shared cache, no user id. RLS on, NO policy (JS-9).
  id, source enum('adzuna','jooble','jsearch'), external_id text,
  url, title, company, location, snippet,
  posted_at, salary_min, salary_max, currency,
  raw jsonb,                           -- the provider's own record, kept for re-normalisation,
                                        -- never rendered (N18)
  fetched_at, expires_at               -- read-time filter (`where expires_at > now()`), not a sweep
  UNIQUE (source, external_id)

job_searches                           -- F22. THE cap's source of truth — counted, not `job_search_hits`.
  id, clerk_user_id, query_hash text,
  titles text[], location, remote bool,
  result_count int, sources text[], created_at

job_search_hits                        -- F22. Cache membership only, no user id (JS-9).
  search_id → job_searches (cascade), listing_id → job_listings (cascade), rank int
  PRIMARY KEY (search_id, listing_id)  -- no `id` column — the composite key is the identity

saved_jobs                             -- F22. The only table that pairs a listing with a person.
  id, clerk_user_id, listing_id → job_listings (restrict),
  analysis_id → analyses (set null) null,
  status enum('saved','applied','interviewing','offer','rejected','closed'),
  applied_at null, note text, created_at, updated_at
  UNIQUE (clerk_user_id, listing_id)
  CHECK (status <> 'applied' OR applied_at IS NOT NULL)
```

`users` also carries `cap_tokens` (CHECK 0..4,000,000) and `analyses` carries `queued_at`
(CHECK: null, or a status that is not `ready`). There is deliberately no `tokens_used` and no
`topup_tokens` column — both balances are SUMs over rows that exist (F19).

**Invariants**

1. `tailored_bullets.source_bullet_id` is `NOT NULL`, `ON DELETE RESTRICT`. A bullet without provenance cannot exist. N1, enforced by Postgres rather than by a prompt.
2. `interview_questions` CHECK enforces N2: evidence, or explicitly a gap question. Written with `cardinality()`, **not** `array_length(x, 1)` — the latter is NULL on an empty array and a CHECK only rejects on FALSE, so both hand-written guards were inert from M1 until `20260810010000_repair_fabrication_checks`. They were passing the smoke test on a foreign-key rejection the test had not earned; the cases now pin the CHECK's own SQLSTATE (23514).
3. `experience_bullets` is written only by user action and by the reviewed onboarding import.
4. `original_text` is snapshotted, so editing the master profile never silently rewrites past analyses.
5. RLS is enabled on every table carrying `clerk_user_id`. `templates`, `skills`, `courses`, `course_skills` and `skill_bundles` are reference data with public read and no write policy for authenticated users. `unresolved_terms` and `corpus_gaps` have RLS enabled with **no policy at all** — they carry no user id and nothing an anon or authenticated request has any business reading.
7. `skill_gaps` CHECK: `unlocks_bullet_draft` cannot exist without `unlocks_bullet_id`. A staged rewrite always names the bullet it rewrites — OUT-2 as a constraint rather than a validator. The bindings themselves are nullable; the binder returns null rather than guessing, so an absent binding is honest and a false one is unreachable.
6. `token_grants.reference` is UNIQUE. A public webhook that grants tokens is redelivered on any non-2xx, and this is what makes a second delivery a conflict rather than a second credit — idempotency as a constraint, not as a remembered check (F19).
8. `roadmap_items` CHECK enforces N14: exactly the foreign key its `kind` names is set, `fixed` has none. A step that names nothing is a claim about work the user never generated — the roadmap's own version of N1/N2.
9. `plan_purchases.reference` is UNIQUE, the same idempotency shape as `token_grants.reference` (invariant 6), for the plan-purchase side of the webhook (F23, PAY-1).
10. `users` CHECK `(plan = 'free') = (plan_expires_at IS NULL)` makes the F23 revenue bug — a paid plan with no expiry — unrepresentable rather than merely unlikely (N21).
11. `saved_jobs` CHECK `(status <> 'applied') OR (applied_at IS NOT NULL)`: a status of "applied" always carries the date it happened (F22).

### 6.3 Storage layout

```
resume/{clerk_user_id}/{document_id}.{ext}       private, signed URL on read
exports/{clerk_user_id}/{analysis_id}/{draft_id}-{template}.{pdf|docx}
exports/{clerk_user_id}/{analysis_id}/all.zip
```

Storage RLS policies mirror the table policies: path prefix must match the requesting subject.
Retention: `exports` objects persist until the user deletes the account (G17 — an earlier draft
of this spec claimed a 90-day expiry sweep; nothing enforces one, because there is no scheduler
in v1 to run it, §12 "no continuous... no CI gating" plus D8's "no scheduler" verdict apply here
too). `resumes` persist the same way: until the user deletes the account or replaces the résumé.
A 90-day export sweep is deferred behind the same trigger as D8 — the first scheduler, whatever
brings it.

## 7. The match score

```
score = 100 × ( Σ weight(r) × credit(r) ) / ( Σ weight(r) )

weight:  required = 3    preferred = 2    implied = 1
credit:  evidenced = 1.0    partial = 0.5    absent = 0.0
```

Deterministic, pure, no LLM. It answers *"how much of this posting can your profile evidence"* — a
fact about the user's own document. It must never claim to predict an employer's ATS or a callback.
`scoreVerdict` and `scoreNote` carry calibration in words ("Strong on delivery, thin on infra"),
never probability. The three buckets are always adjacent so the number is never the whole story.
`scoreDash` is the SVG `stroke-dasharray`, derived from `score` at render time.

## 8. Flow

```
ONBOARDING (once)
  upload résumé → Supabase Storage → text extract → generateObject(ResumeJson)
    → MANDATORY REVIEW SCREEN → master_profiles + experience_bullets

PER ANALYSIS (Step 1 of 3)
  JD paste or upload
    ↓  parsing screen: 4 named steps + progressPct, streamed
  ① analyze-jd      → JdMeta + jd_requirements (with mention_count)
  ② coverage        → coverage_items + score          [PURE, no LLM]
  ③ tailor          → capResumes × resume_drafts + tailored_bullets
  ④ interview       → 12 × interview_questions
  ⑤ learning        → skill_gaps + learning_plans + learning_steps
                      (S3 resolve → S4 score → S5 bundle lookup → S5b select
                       → S5c bind → S5.5 knapsack → S6 ONE call → S7 validate)

RESULTS
  score header + 3 buckets
  ├─ Resumes   N drafts · Compare two · Download all
  ├─ Prep      12 questions · family tabs · expandable · worked answer on demand
  └─ Learning  ≤7 gaps by severity · ≤3 resources each · time-budgeted plan
               each resource bound to a bullet it unlocks and a question it answers
  → Preview [template] → diff · Still not evidenced · See courses → Learning
```

**Why coverage has no LLM:** the score is the number the user trusts to make a decision. It must be
deterministic, reproducible and explainable line by line.

## 9. Feature specifications

### F0 — Shell and theme

Sticky header on the ground (not a raised surface): brand mark, `New analysis · Jobs · History ·
Profile · Pricing` (plus `Admin` for admins), the token balance pill (F19), the walkthrough button
(F20) and the Clerk user button with the member's name beside it on wide screens. The page you are
on is set in the heavy weight — the only active treatment.

`Admin` is listed in the header and the mobile sheet only for admins. For everyone else the admin
section does not exist: `/admin` (any sub-path, any query) returns the ordinary 404 (F15).

**Footer**, on every surface including the public ones: the mark and the one-line promise, then three
columns — Product (`New analysis · History · Profile · Status`), Company (`How it works · Privacy ·
Contact`) and Support us — over a rule carrying `Terms · Privacy`. The dot beside `Status`
is live: it renders only when a stage is actually degraded, from the same aggregate F14 reads. A
decorative pulse next to the word "Status" would be the exact lie that page exists to prevent.

**Theme.** One palette, light only — cream ground, maroon ink, marigold accent, pink second accent
(CLAUDE.md §9). Every colour is a token in `app/globals.css` (N9); base and DS rules live in cascade
layers so a Tailwind utility can refine a DS default. Dark mode and the palette picker (F18) were
retired with the Sep 2026 redesign; `/appearance` redirects to `/profile`.

**Acceptance:** `--color-text-muted` on the ground clears 4.5:1; ink on marigold and ink on pink
clear 4.5:1.

### F1 — Onboarding: profile import

Upload PDF/DOCX/TXT ≤5 MB → `resumes` bucket → raw text (`unpdf` / `mammoth` / plain) →
`generateObject` → **mandatory review screen** → commit.

No regex section detection. The LLM structures from raw text, which is far more robust to two-column
layouts. Each `highlights[]` entry becomes one `experience_bullets` row — this atomization is the
foundation of both fabrication guards.

Profile card afterwards reads `filename · Parsed · N yrs experience · N skills`, with **Replace resume**.

**Acceptance**
- 2-page two-column PDF yields ≥90% of bullets, correctly attributed to employers.
- Image-only PDF → `no_text_layer` → told to upload a text version, never handed silent garbage.
- Encrypted PDF → clear rejection.
- Dates parse to ISO `YYYY-MM`; ambiguous ones surface as a review prompt, never a guess.

### F2 — JD input (Step 1 of 3)

`Step 1 of 3 · The posting` → *"One résumé in, N tailored out"*, where N is `draftsPerRun` for
this member — never a number written into the copy. Two columns: the posting goes in the
left, and the right rail holds the corpus and the contract — the profile card, and **What comes back**
in three numbered lines. Side by side on purpose: you can see what we'll draw *on* while you paste the
thing we'll draw *against*.

Segmented control: **Upload file** / **Paste text**.

- Drop zone with drag states (`dzBg`, `dzBorder`, `dzTitle`, `dropGood`/`dropBad`) — PDF, DOCX or TXT up to 5 MB.
- Paste mode: textarea with live `charCount` and **Load sample posting**. The 120-character floor is
  quoted only once there is something to measure — over an empty box it's a scolding.
- Design's demo affordances ("Try: a valid posting / an unreadable file") ship behind a dev flag, not in production UI.
- Error region (`errorTitle` + `error`) renders inline in accent-800 on accent-100, never a toast.
- Primary action **Analyze posting**, disabled until input is valid.

**Acceptance:** identical JD text (by `content_hash`) reuses the prior analysis, no second charge.

### F3 — Parsing screen

`Step 2 of 3 · N% complete`, the running stage's own heading and description, `progressPct` bar, and
four named steps resolving in sequence with a per-row status: *Reading the posting → Matching against
your profile → Rewriting your resume → Preparing questions and courses.* Streamed, never a fake timer.
A stage failure stops there and says what failed — a spinner that lies is worse than an error.

**A failed run stays on this screen.** The redirect to the results fires only when the stream ends
without a failed stage; a run that broke would otherwise be dropped on a résumés tab with no header
and no tabs. Beside *Try another posting* there is **Pick it up again**, which re-POSTs the same
analysis. It never fires on its own — a page reload must not bill anybody.

**Resuming is enforced, not asserted.** `runAnalysis` consults `resumeState` before each stage and
returns early where the rows already exist, so a resumed run pays only for what it has not already
produced. Measured end to end: re-running an analysis whose five stages were all complete finished
with the row counts unchanged and `ai_runs` unmoved — zero model calls. Before this the pipeline ran
every stage unconditionally, which duplicated requirements, coverage and questions and *threw* on
drafts and the learning plan, whose unique constraints refused the second write.

One value is rewritten on the skip path too: `fail()` reports a stage failure by putting its message
in `scoreNote`, the column the score's own calibration lives in. A resume that skipped matching would
leave the results header explaining the crash instead of the number, so the score, verdict and note
are re-derived and written on both paths. They are pure functions of rows already in hand.

**Stage figures.** Each stage carries a small looping diagram of the work it is doing: a page under a
scan line, requirements wired to the bullets that evidence them (and one wired to nothing), a bullet
being typed while two others swap places, questions and course cards forming. They answer what a
progress bar can't — *what* is taking the time. They are the only looping animations in the app, only
one is mounted at a time, they are `aria-hidden`, and the whole set freezes under
`prefers-reduced-motion`. The accessible account of progress is the stage list and the progressbar.

### F4 — Coverage + score header

`Analysis complete · {jdSource}` with extracted JdMeta, the score ring, verdict, note, and three
bucket cards with counts and tags.

Below it, the three surfaces as an underline tab bar carrying a count each — `Résumés 11`,
`Interview prep 12`, `Learning 4 gaps`. The Résumés tab also reads selected on
`/analysis/[id]/preview/[templateId]`: a preview is a résumé opened, not a fourth place to be.

**The header and the tab bar exist only for a `ready` analysis.** So every tab, and the preview,
redirects to `/analysis/[id]` while the run is anything else — otherwise the page renders with no
score, no tabs and no way back. The counts are read before the tab is opened on purpose: a
surface that generated nothing is visible as empty from here rather than after a click (§11
Reliability). Real links, so a tab is shareable and the back button behaves.

**Acceptance:** every **Strong match** tag traces to a specific bullet in one click.

### F5 — Tab 1: Resumes ("N drafts, same evidence")

One card per draft: thumbnail by family, name, `pages`, `kind` tag, `ATS {rating}` badge, plus **Download all**.
`tailorSummary` states in one line what changed across all drafts.

The thumbnail is an abstract miniature of the layout — grey bars on white paper, the template's own
accent, no readable text. Its job is to make the ATS badge legible: you can *see* Ledger's two-column
body and Atlas's icon-only contact row, which is what costs each of them its rating. Paper colours, not
brand tokens; the §9 export exemption covers the picture of the document as well as the document.

**Compare two** appears in the design as a decorative control with no behaviour. It is deferred rather
than shipped dead — a button that does nothing is worse than one that isn't there.

Per draft: rewritten evidence-bound bullets, section ordering, skills reordered to lead with
JD-relevant ones the profile actually contains, summary line assembled only from existing claims.

**Guardrails**
- A rewrite introducing a metric, tool, or seniority level absent from the source fails validation.
- Every returned `source_bullet_id` is verified against the input set. Invented id → one corrective retry → verbatim fallback.
- Numbers only if present on the source bullet.

**Acceptance:** the M4 fabrication eval passes at zero (§12).

### F6 — Preview + diff

Full-page preview of the actual template family — same layout, same accent, same typeface as the
export, on white paper — with **All N drafts**, **Download DOCX**, **Download PDF**, a one-chip-per-draft
template switcher, and a right rail: `cur.name`, `cur.blurb`, kind tag, ATS tag, the computed rating's
own reasons, **What changed for this posting** (`changes`), and **Still not evidenced** (`missing`)
with **See courses for these** linking into the Learning tab.

Two demands pull against each other here: the preview has to look like the download or it is lying
about it, and it has to show what we changed in the user's own words, which the download deliberately
doesn't. Resolution: **the diff is drawn inside the bullets, not in a panel beside them.** Word-level,
with the `transform` labelled — `rephrase` and `requantify` are different promises (§3). Highlighting
is on by default and the toggle turns it *off*; the user should never have to hunt for what we altered.

The rating's reasons are read off the same structural flags the rating was computed from (N5), never
hand-written prose that could drift away from the badge beside it. **Edit content** is not implemented.

That cross-link is the product's best moment: the preview admits what it can't cover and hands the
user the fix. Do not remove it.

### F7 — Tab 2: Prep

Twelve questions from the responsibilities and the profile gaps; four flagged **Most likely**. Each
expands to **Why they ask**, a three-point **Answer framework**, and **Pull from** the profile
evidence.

- Non-gap questions must cite evidence (N2), enforced by CHECK.
- Gap questions coach honest positioning — what to lean on instead, what you're doing about it. Never a fabricated credential.
- The framework is scaffolding, not a script. Copy should say so.

**Tabs by family.** `All` · `Most likely` · `Technical` · `System design`, then any of
`Behavioural` / `Situational` / `Culture` / `Gaps` that the posting actually produced. The first four
show even at zero, because their emptiness is itself information: a posting with no design round
should say so rather than hide the tab. `system_design` is its own enum value, not a flavour of
`technical` — a filter over a value that doesn't exist in the data is a filter that lies.

### F7.2 — Worked answers

A framework is right for rehearsing a behavioural answer and wrong for a technical or design one,
where the substance *is* the answer. Any question can be expanded into a full worked answer:
headline, three-to-five sections, follow-ups the interviewer would push into, and the concepts to be
solid on.

**The fabrication boundary is enforced by splitting the answer, not by prompting care:**

| Block | Rule |
|---|---|
| `sections` | General knowledge about the subject. Makes no claim about the candidate, so there is nothing here to fabricate. |
| `resumeHooks` | The only first-person material. Each cites one `experience_bullet` and restates only what that bullet already claims. A hook citing an unknown id is dropped at generation and again on read. |

An empty `resumeHooks` is a correct answer — the UI says so plainly rather than reaching for an
example that isn't there.

**Cost.** Drafted on demand, one question at a time, on the **mid** tier, cached in
`question_answers` and never re-charged. The expensive judgement — what this candidate can evidence —
already happened in coverage and question generation; this step writes prose over decided facts.
Twelve extra calls on every analysis would buy latency for a surface most users open once.

`keyConcepts` are plain concept names, never links. Course links come from the curated catalog by the
same deterministic matcher the Learning tab uses (N8).

### F8 — Tab 3: Learning (the Learning Engine)

Rebuilt against `learning recommendation engine/` — spec, agent, guardrails, rag-strategy and
prompts. The tab is no longer "gaps with two course cards beside them"; it is a **ranked,
evidence-anchored, time-budgeted plan**.

**What the user gets.** The literal request is "recommend learning material for the gaps." The real
goal is: *let the candidate walk into this specific interview able to truthfully claim something they
could not claim yesterday.* So every recommended resource is bound to three things, and shows all
three:

1. **The gap it closes** — a canonical skill the posting requires and the profile can't evidence.
2. **The résumé bullet it unlocks** — the bullet that becomes truthfully rewritable *after* the
   learning. Staged prospectively, never as a claim available today. This is CLAUDE.md §3 applied to
   the Learning tab.
3. **The interview question it answers** — an existing row from the Prep tab.

**The bar sits on false bindings, not absent ones.** Spec §1's literal rule — a resource bound to
fewer than all three is not shown — was built first as `NOT NULL` columns on `learning_steps`.
Measured end to end against a real profile it withheld vetted material for **5 of 6 gaps**: the
corpus had good Kubernetes and GraphQL resources and the rule hid them, because no bullet and no
question happened to bind.

A card offering two vetted Kubernetes resources and claiming nothing about the candidate's history
claims nothing false. A card claiming the wrong bullet does. So the bindings are nullable, and the
guarantee moved to the state that is actually dangerous: `skill_gaps` carries
`CHECK (unlocks_bullet_draft IS NULL OR unlocks_bullet_id IS NOT NULL)` — a staged rewrite with no
source bullet is unrepresentable, which is guardrails.md OUT-2 as a database fact. Bindings are set
only by the deterministic binder, which returns null rather than something plausible.

**The pipeline.** Eight stages, exactly one billable model call:

| Stage | What | Cost |
|---|---|---|
| S3 · resolve | free text → canonical skill, 4 tiers, no LLM (`lib/domain/resolve.ts`) | 0 tokens |
| S4 · score | `importance × (1 − evidence) × 100` (`lib/domain/severity.ts`) | 0 tokens |
| S5 · retrieve | `skill_bundles` primary-key lookup (`lib/learning/bundles.ts`) | 0 tokens |
| S5b · select | deterministic personalisation (`lib/domain/selection.ts`) | 0 tokens |
| S5c · bind | gap → bullet, gap → question (`lib/domain/binding.ts`) | 0 tokens |
| S5.5 · plan | knapsack over durations (`lib/domain/plan.ts`) | 0 tokens |
| S6 · synthesise | narrative + staged bullets (`lib/ai/synthesise-plan.ts`) | ONE strong call |
| S7 · validate | OUT-1 link resolution (`lib/learning/validate.ts`) | 0 tokens |

The spine: **every expensive operation happens once at ingest, never at query time.** Retrieval,
ranking and diversity enforcement run in `pnpm bundles:rebuild`, once per `(skill, level)`, and are
read by every user forever. A change that moves work from ingest-time to request-time needs a written
justification — request-time work is billed on every run, ingest-time work is amortised across all
users.

**S6 never receives chunk text.** It gets resource *metadata* — title, author, duration, entry point,
and a one-line precomputed summary. This is the single largest token saving in the design: passing
retrieved passages is what makes naive RAG expensive, and here it would buy nothing, because the
synthesiser's job is framing, not summarising.

**The score.** `severity` is `importance × (1 − evidence) × 100`, deterministic and reproducible.
`importance = w_section × w_modality × w_repetition × w_position × w_depth`, read off `kind`,
`necessity`, `mention_count`, list position and taxonomy depth. `evidence` grades the profile's
strongest claim on the same node or within two taxonomy hops. Both are stored, so a plan does not
silently re-rank when an unrelated bullet is edited.

Hard cap of **seven gaps**. It is a cost control — it bounds S6's input — and better product: seven
gaps is a plan, twenty is a demoralising audit.

**The taxonomy** (`lib/catalog/taxonomy.ts`) turns the flat skill canon into a tree with
`parent_id`, `depth`, a roadmap.sh path and a volatility rating. It is the join key that makes
precomputation possible, and it is *ingested*, never fetched at request time.

**Time budget.** The user picks "2 hrs / 6 hrs / a weekend / no limit" and the plan re-solves —
a pure knapsack over durations with prerequisites ordered first. No model call, no second charge,
because the expensive part already happened.

**When the corpus has nothing** (spec §9): emit the roadmap.sh node link and nothing else. No live
web search, no YouTube lookup. Every fallback is logged to `corpus_gaps`, which ranked by demand
*is* the ingestion backlog. The fallback path is a feature, not a degradation.

`You` vs `Required` is still drawn rather than described: one track, a filled bar for the level the
profile evidences and a tick for the level the posting asks for. Both marks now come from the same
deterministic evidence value as the prose beside them, so the meter and the sentence cannot disagree
(guardrails OUT-5).

**Corpus (N8).** Curated, version-controlled in `lib/catalog/courses.ts`, seeded into `courses` with
type, author, quality score and status; `course_skills` carries the per-skill entry point and
summary. Never model-generated. `pnpm check:links` sweeps course URLs *and* roadmap fallback targets
— a dead fallback is a 404 in front of a job-hunter exactly as a dead course is.

**Guardrails** (`lib/domain/guardrails.ts`), each code and not prompt:

| Rule | What it stops |
|---|---|
| IN-4 | PII redacted before bullet text reaches the synthesiser |
| IN-5 | Injection scan on JD text; output containment is the real defence |
| IN-6 | A discriminatory requirement never becomes a gap; flagged once, neutrally |
| OUT-1 | Every resource id resolves to a live row; the schema has no URL field |
| OUT-2 | Every staged bullet traces to a real bullet and is phrased prospectively |
| OUT-4 | Every `why_it_matters` is grounded in a verbatim JD span |
| OUT-5 | The narrative uses the evidence bucket it was given |
| OUT-6 | No odds, no comparison to other candidates, no "deficiency" |

**Not built, and why.** The spec's pgvector/embedding tier of the resolver, hybrid search with RRF,
cross-encoder reranking, amortised HyDE, and the YouTube/PDF/repo ingest pipeline all need a chunk
corpus and ingest infrastructure this repo does not have (planning.md Phase 3). Candidate generation
in the bundle builder is the taxonomy join instead; the roll-up, diversity and freeze steps are
implemented as specified. When the corpus exists, only `candidatesFor()` in
`scripts/rebuild-bundles.ts` changes.

### F9 — Export

Both formats render from the same `resume_json`. `lib/render/ats-rules.ts` holds shared constraints
and the rating function.

**ATS-safe rules:** single-column body for `classic` (sidebar/creative are two-column by design and
rate lower, honestly) · standard section headings · real text throughout, no icons or graphics
conveying information · contact details as body text, never in a header region · dates
`MMM YYYY – MMM YYYY` consistently · embedded licensable fonts, no ligature substitutions that mangle
extraction.

**DOCX** (`docx` npm) — the submission artifact. Named paragraph styles, list paragraphs, no floating elements.
**PDF** (`@react-pdf/renderer`) — the human artifact. Chosen over Puppeteer because Chromium is ~100 MB against Vercel's 50 MB default function limit and react-pdf renders in under 500ms versus 2–5 seconds. Accepted tradeoff: constrained component set, flexbox yes, CSS Grid no, no pseudo-selectors. Templates are designed to that constraint, not ported from web CSS.
**Download all** — 6 × 2 zipped to `exports/{user}/{analysis}/all.zip`, served via `files.koustubh.org`.
Filenames `Firstname-Lastname-Company-Role-Template.docx`.

**The PDF and the preview are one design in two renderers.** `lib/render/pdf/index.tsx` and
`preview-surface.tsx` must agree on structure — same header shape, same section order, same rail on the
same side, same accent doing the same job. They agree on *ratios*, not pixels: the PDF works in points
on A4 and scales every value off the body size so the density loop can compress a document without
redesigning it. Change a layout in one, change it in the other; a preview that lies about the download
is worse than a plain one.

Two consequences worth stating, because both were bugs:

- **Typefaces are the ones the PDF actually has.** react-pdf ships the PDF base-14, and registering a
  webfont would mean fetching it per render. So `fontStack` names Helvetica and Times, not the brand's
  Figtree — a preview set in a face the download can't use is a preview that lies. Broadsheet's serif
  swaps the *whole* stylesheet, body and bold together.
- **Neither renderer hides content.** No truncated skill lists, no dropped certifications. If a section
  fits one surface it appears on both; the density loop is what handles length, not omission.
- **The list mark is a literal character in every family**, tinted rather than dropped where the design
  styles bullets away. A coloured `•` still extracts as a list; an absent one loses the structure.

DOCX is deliberately not held to this. It is the *parseable* artifact — named paragraph styles, no rail,
no colour band — and matching the PDF's layout would cost it the thing it is for.

**Acceptance**
- PDF text is selectable (select-all highlights every character).
- DOCX opens in Word and Google Docs with styles intact, no repair prompt.
- Round-trip (§12) recovers ≥95% of fields.
- Every template's PDF and on-screen preview show the same sections in the same order.

### F10 — History

Past analyses: company, title, score, date, status. Opens stored results — no regeneration, no
re-billing. Master profile edits never rewrite past analyses (§6.2 invariant 4).

### F11 — Profile

One screen over the whole corpus, because the corpus is one thing. Two columns: the token meter
(F19), identity and contact, summary, skills, experience, then education / certifications /
languages / preferences; aside carries profile strength and the checks that explain it. The AI
layer writes to none of it (N3) — that is what makes the fabrication guard mean anything.

The meter leads the column, as in the design. It is the one thing on this page that is not the
corpus, and it is above the corpus because it is what the corpus costs to use. It is a server
component slotted into the client editor rather than imported by it — the balance is two aggregate
queries and has no business in a bundle.

**Everything here is editable.** Education and certifications were read-only cards; a page whose
whole argument is "a draft can only say what exists here" cannot have sections you are unable to
put anything into. Both take add and remove, and experience takes "Add a role".

**Skills collapse.** The heading is a disclosure carrying the count; collapsed, the list is one row
of chips coloured by evidence rather than by level, on the same rule the open rows state. Open is
the default — collapsed is for someone who has read them and is here for something else.

**Dates are guarded at the field.** `YYYY` / `YYYY-MM` is all `StoredResumeSchema` accepts and the
editor autosaves per keystroke, so a field bound straight to the document rejects the save at "2",
"20" and "201" on the way to "2017" and reports it as a save error. `DateInput` holds what was
typed and commits only when it is a date; empty commits `null`, because "not stated" is an answer.

**The evidence label is the point.** Every bullet and every skill says how often it has actually
been cited by a draft, counted from `tailored_bullets`. A bullet at zero is either badly written or
about work nobody is hiring for, and either way it is the next thing to fix. Two counting rules
matter and both are easy to get wrong:

- **Per analysis, not per row.** One run renders a bullet into every template in the cap. Counting rows
  says "used 11×" for a bullet used once, and climbs a cap at a time for work done once.
- **A skill reports bullets, not a sum.** Adding its bullets' counts up would count one analysis
  once per bullet it cited, producing a figure that sounds like a tally of postings and isn't.

**Skill suggestions** come from this user's own `skill_gaps` — things their analyses already found
missing — not a popularity list. Hence "from your recent analyses". Adding one puts a name on the
profile with no bullet behind it, which is a claim rather than proof, and the section says so.

**Profile strength** (`lib/domain/profile-strength.ts`, PURE) is a score out of 100 on a stated
rubric, not a percentage of anything and not a prediction. Every factor is a property of the corpus
— bullet count, how many carry numbers, how many have been cited, summary length, proficiency
coverage, links — because a completeness meter that ticks up when you fill in a phone number would
be measuring the form, which is the same class of dishonesty as an "ATS score" (N4). The checks
beside it are the same computation rendered as sentences, so the list always explains the ring.

**Saving is not importing.** `commitProfile` replaces the profile and mints new bullet ids;
`saveProfileEdit` matches on the paths in `x_roleform.bulletIds` and updates in place — existing
path updates its row, new path inserts, removed path **retires** (`experience_bullets.retired_at`).
Retiring is what lets someone drop a bullet without rewriting the history of an analysis that
quoted it (§6.2 invariant 4), and it is required: `tailored_bullets.source_bullet_id` is
`onDelete: Restrict` (N1), so deletion would fail outright once any analysis exists. Every read of
the living profile filters `retired_at is null`.

Edits validate against `StoredResumeSchema`, not `ResumeJsonSchema` — the narrower one drops
`x_roleform`, and that is where the bullet ids live.

**Acceptance:** editing a bullet leaves every id unchanged and no dangling `source_bullet_id`;
deleting a cited bullet retires it rather than throwing, and re-adding the same path revives it; a
bullet used by one analysis reads "used as evidence 1×", not 6.

### F12 — The written pages

`/how-it-works`, `/privacy`, `/terms`, `/support`. Public — no session. A promise you
have to create an account to read is not a promise you can act on, and privacy is the promise this
product most needs to make in writing.

Content lives in `lib/content/` rather than a CMS, because each page is a commitment the code has to
keep: when §3's fabrication boundary moves, "What we can't tell you" moves in the same commit.

- **How it works** is the four stages, each with what it *refuses* to do. The refusals are set as a
  list, not buried in prose — they are the load-bearing sentences.
- **Support us** publishes where the money goes, labelled **planned allocation** rather than a report,
  because we have not taken a quarter of money yet. Presenting a forecast as a result is the same
  class of lie as an "ATS score" (N4).

**Acceptance:** all four render signed out; no page claims a number it cannot source.

**Removed.** There was a fifth, `/changelog`, listing releases from `lib/content/changelog.ts`.
The page, its content module, its skeleton and every link to it were deleted; `/changelog` is no
longer public in `middleware.ts` and now 404s. Do not reinstate it without asking.

### F13 — Contact

Public form → Zod → `contact_messages` → mail. **Stored first, then sent**, and the order is the
design: the row is the durable record and the mail is a convenience on top of it, so a provider
outage costs a notification and never a message.

Two messages go out per submission. The **notification** to `CONTACT_TO` carries the sender's own
subject and sets `Reply-To` to the sender, so replying just works. The **receipt** to the sender
quotes their message back — the one thing a receipt has to prove is that we hold the words they
typed — and points `Reply-To` at the support address, never no-reply.

Provider: Resend, over `fetch`, in `lib/mail/send.ts`. No SDK, for the reason Razorpay has none
(CLAUDE.md §8). Swapping providers is that one file.

**Unset is a supported state.** With no mail keys the form still files everything, the rows read
`disabled`, and the confirmation says so rather than claiming an email. What the sender is told
always tracks what happened: *"a copy is already in your inbox"* only when the receipt was accepted.

Prefill comes from Clerk when there is a session — never from us. We hold a hash of the address (N7)
precisely so we cannot read one back. Nothing about a message is ever logged (N7); a failed send's
reason is stored on its own row, where only an admin sees it.

**The support inbox** (`/admin?panel=inbox`, admin only) is the read path for the rows: every
message, whether it was mailed or not, with a resend for the ones that weren't and a handled flag
that carries the admin's subject beside it. It is what makes "stored, not lost" true rather than
aspirational — an undelivered message is announced on the admin header, because it exists nowhere
else.

**Acceptance:** a message under 20 characters is refused with a reason; six in an hour is refused with
the direct address; the row survives with `clerk_user_id` null for a signed-out sender; with mail
misconfigured the row is still written and the confirmation does not claim an email was sent.

### F14 — Status

`/status`, public. Per-stage health for the four-stage pipeline, **derived, never authored**: each
stage's state is read back out of `ai_runs` over the last hour — degraded at ≥20% schema-invalid or a
mean of ≥1 corrective retry. Under five runs a stage reports Operational *and says the sample is too
small to be a verified one*; "unknown" dressed up as "healthy" is the failure this page exists to
avoid. Matching runs no model at all (`lib/domain/coverage.ts` is pure), so it says it has no worker
to degrade.

**Stopped part-way.** Deliberately *not* called parked: that word is spent on a posting filed
against the allowance (F19), which has started nothing and cost nothing, and this is a run that
started and spent tokens. For a signed-in viewer, the newest analysis still in `parsing`, not queued,
and at least six minutes old — the stream's own route caps at 300s, so anything younger may still be
running, and this panel used to tell people their live run had stopped. Progress is counted
from what the run persisted — requirements mean reading finished, coverage items mean matching
finished, drafts mean rewriting, questions mean preparing — so the bar is a fact about rows, not a
guess about a worker. A stage in flight contributes nothing; rounding up would be an invention.

The page re-reads itself every 30 seconds and shows the countdown, so the number on screen has a
known age.

**Acceptance:** with the pipeline healthy the page says so without inventing an incident; with a
degraded stage the header names *which* stage and the other three still read Operational.

### F15 — Generation controls (admin)

Four caps per member, on `users`, each with a CHECK constraint: `capAnalyses` (per cycle),
`capResumes` (per analysis, 0–6), `capAnswers` (per cycle), `capCourses` (per gap, 0–6). Four caps
rather than one credit balance, because the four things cost different amounts and fail at different
seams — telling someone out of answer drafts that they are out of analyses is the generic error this
feature removes.

**Scope.** One workspace, which in v1 is the whole install: organisations are not enabled on the
Clerk instance, so the admin role is an operator role rather than a per-tenant one. When
organisations arrive, `currentRole()` reads `orgRole` instead and `listMembers()` grows a membership
join — nothing else about the panel changes, which is why the caps live on `users` and not in a
settings blob.

**The role lives in Clerk**, as `publicMetadata.role`, and that is the only source of truth
(`lib/admin/role.ts`). It is set in the Clerk dashboard, which is where the people who grant
permissions already work, and it keeps the privileged bit with the identity rather than beside the
usage counters. `users.role` is a **write-behind mirror**, refreshed whenever a request resolves a
role and written by nothing else — it exists so SQL can reason about roles, never so it can decide
anything. Both the gate and the member list read Clerk directly.

`pnpm grant:admin <clerk_user_id> [--revoke]` does the same thing from a terminal, for scripting a
new environment or fixing an instance you can only reach over ssh. It writes Clerk, then nudges the
mirror.

**Identity.** Names and addresses come from Clerk at render time, never from us (N7). The panel reads
usage counts from our tables and cannot read a member's profile, résumés, answers or postings — not
as policy but because the RLS policy keyed to the subject does not admit it.

**Enforcement**, each at its own seam:

| Cap | Where | Behaviour at the cap |
|---|---|---|
| `capAnalyses` | `checkAnalysisAllowance` | New runs refused, naming the cap and the admins who can raise it. Existing analyses stay readable. |
| `capResumes` | `writeDrafts` | Renders the highest-ATS templates first. Below the catalog size is fewer drafts, never worse ones. |
| `capAnswers` | `draftAnswer` | Frameworks stay free at every cap, including zero. Already-drafted answers stay readable. |
| `capCourses` | Learning tab | Bounds the course list per gap. **The gap is always shown**, at any cap including zero. |

Counted from rows, never decremented from a balance — so a run that fails to start costs nothing and
the two ways a balance drifts (a crash between decrement and insert, a refund that fires twice) stop
being representable. This replaced `users.quota_remaining`, which is no longer read.

**Suspension** stops new generation only. Existing analyses stay readable; we never lock someone out
of their own documents (§13).

**Workspace defaults.** The four caps a **new** account is provisioned with, held as a single row in
`workspace_settings` under the same CHECK bounds as the per-member caps. Both doors into a new
account — `provisionUser` and the `user.created` webhook — read it, so they agree about what a new
account starts with. Editing a default deliberately touches **no existing row**: a member's caps are
already their own, and an admin who wants to move one has the per-member panel, where the usage they
are moving the line across is on screen beside it. A "defaults" control that silently re-capped the
workspace would be the unexplained refusal this feature exists to remove, delivered a day later.

**Workspace name.** `NEXT_PUBLIC_WORKSPACE_NAME` names the admin kicker ("Admin · Acme workspace").
Unset is a supported state: it falls back to generic wording.

**Admin-only visibility.** The admin section is invisible to anyone who is not an admin — no link, no
button, no redirect, no 403. Three independent locks:

1. **Navigation.** The header link and the mobile-sheet row render only when the server resolved the
   role as admin. No member-facing surface (cap walls, notices, emails to members) links to `/admin`.
2. **Routes.** `middleware.ts` answers a signed-out `/admin` request with the 404 page rather than a
   sign-in redirect (a redirect would confirm the route exists), and `app/(app)/admin/layout.tsx`
   calls `assertAdminOr404()` (`lib/admin/guard.ts`) before any admin skeleton or data is streamed,
   so a signed-in member gets the same 404. The page asserts again.
3. **Actions.** Every admin server action re-reads the role from Clerk (`requireAdmin`), so a forged
   request from a member is refused even though no UI offers it. There is no member-callable
   "request admin access" action; admins are granted in the Clerk dashboard or with
   `pnpm grant:admin`.

`/admin` is also absent from `robots.txt` — listing it there would publish its existence — and the
admin layout sends `noindex`.

**Acceptance:** signed out, and signed in as a member, `/admin`, `/admin?panel=inbox` and any
`/admin/*` path return the 404 page with a 404 status; no admin link appears anywhere for a member;
a member cannot change another member's caps through the action even with a forged payload; a cap of
0 renders as "Off" and refuses with a sentence, not an error code.

### F16 — Loading states

Every route has a `loading.tsx` — all of them, including the landing page, which reads nothing but
still builds as `ƒ` because Clerk's middleware runs on it, so a click on the wordmark from inside the
app holds the old screen exactly like any other route. A page that reads the database or the
identity provider without one shows the **previous** page until its round trip finishes, which reads
as a dead click — the one failure a placeholder genuinely prevents. Each skeleton mirrors the layout
it stands in for, so content landing does not reflow the page, and the Suspense boundary it creates
is also what lets Next prefetch a dynamic route at all.

**A layout that awaits blocks everything under it**, and no child `loading.tsx` can get in front of
that — the layout resolves before its children render. Both layouts previously did: the footer
awaited pipeline health and the app header awaited the Clerk role for its chip, so every page in the
product held its first paint behind two round trips it did not need. Both are now isolated behind
their own `<Suspense>` with the async work pushed into a leaf component (`DegradedDot`, `RoleChip`).
The links, the wordmark and the nav paint immediately; the two live details arrive when they know
something. **Layouts stay synchronous** — if one needs data, the data goes in a suspended leaf.

The degraded dot's fallback is `null` on purpose: absence is the healthy state, so an empty slot
while the read is in flight says the right thing rather than flashing a placeholder that implies a
problem.

### F17 — Pricing

Three plans, `free`, `pro` (₹499/month) and `ultra` (₹1,299/month), matching the `PlanTier` enum.
**A plan IS its five caps.** Each row of the comparison table is a `QuotaKey` and the number beside
it is the number enforced at that cap's own seam (F15, F19) — there is no prose describing a limit
in words, because a sentence and a constraint drift and the sentence is the one people read before
paying.

| | Free | Pro | Ultra |
|---|---|---|---|
| Token allowance | 60,000 / month | 800,000 / month | 3,000,000 / month |
| JD analyses | 3 / month | 40 / month | 150 / month |
| Résumés rendered | 2 / analysis | 6 / analysis | 6 / analysis |
| Full answer drafts | 3 / month | 40 / month | 200 / month |
| Course matches | 2 / gap | 4 / gap | 6 / gap |

**One-off top-ups** (₹99 / 100,000 and ₹249 / 300,000) on paid plans only. They never renew and
never expire — the plan allowance does not carry across a cycle, an unspent top-up does, which is
the only thing that distinguishes the two. A pack that expired at the turnover would be a cap with
worse terms sold at a higher price. Free cannot buy them, enforced in the action and not only in
the UI: "you can top up forever" is how a free tier stops being a free tier.

The free row is also what `workspaceDefaults()` **seeds** a fresh install with, so a new account
really does start on the numbers the page publishes. Seeded once — an admin who raises a default
afterwards is not overwritten on the next read.

**Refusals, published on the page** for the same reason the four pipeline stages publish theirs:
paying does not move the match score (it is requirement coverage — a fact about your own document),
does not add experience to your profile, and does not buy a better model, parser or rewrite. The
pipeline is the same one on both plans. This is the page a product is most tempted to overclaim on,
which is the reason to state the boundary here rather than only in §3.

**Payments — Razorpay**, over `fetch` and `node:crypto` with no SDK: order creation is one
authenticated POST and webhook verification is one HMAC, and a dependency for that is one more thing
to audit and pin for no capability gained (§8's reasoning). The amount is read server-side from
`PRO_PRICE_PAISE`; a price the browser sends is a price the browser chooses. The checkout script is
loaded **on first click**, never on page load — a pricing page that ships a third-party payment
script to be *read* hands a tracker to everyone who was only comparing numbers.

**The plan is granted only in the webhook**, on `payment.captured` — never `payment.authorized`,
which is money that can still fail to settle. The client handler refreshes and nothing more; an
action that flipped the plan on a click would grant Pro to anyone who could open the network tab.
Upgrading writes the Pro row's four caps onto the account alongside `plan`, because the table on the
page IS those numbers. Unset keys are a supported state: the button says payments aren't switched on
rather than failing into a blank window.

**A top-up credits `token_grants`, keyed on the payment id.** The reference column is UNIQUE, so a
webhook Razorpay redelivers (it will, on any non-2xx, for a day) hits the index rather than the
balance — idempotency as a constraint rather than as a check somebody has to remember to write
(§12). `notes.kind` says what was bought; inferring it from the amount would mean a price change
silently granting the wrong thing.

**The same two plans appear at the foot of the admin panel** (the design's "Plans & coupons" strip),
read from the same `PLANS` table `/pricing` renders — so the panel cannot quote an operator a cap the
public page does not sell. Nothing there is editable: caps are changed per member in the panel above
or for the next signup under Workspace defaults, and a third control writing the same four columns is
a third place for them to disagree. The one number that is not already on `/pricing` is the one worth
an admin's attention — how many accounts on a plan carry a cap that plan does not publish
(`rollUpPlans`, rolled up from the member list already loaded, so the strip costs no second query).

**No coupons.** The design shows four coupon rows with redemption counters and toggles. There is no
coupon table, no redemption seam and nothing that would honour a code at the point of payment, and a
toggle that changes nobody's bill is the decorative surface the rest of this product refuses to
ship. If coupons arrive they arrive as a table with a cap and a redemption count, enforced where the
order amount is computed — not as a page.

**Acceptance:** an unsigned or wrongly-signed webhook is refused before its body is parsed; the
displayed price and the charged amount come from one constant; a signed-out visitor clicking Go Pro
is sent to sign in and returned to `/pricing`, not shown an error; every cap printed in the admin
plan strip equals the one on `/pricing` for that plan.

### F18 — Appearance (retired)

Retired in the Sep 2026 redesign. The product ships one light palette (F0, CLAUDE.md §9); the
picker, the six palettes and dark mode were removed, and `/appearance` redirects to `/profile`.
The résumé templates remain exempt from the brand and render black on white (§9, F9).

### F19 — The token meter

The fifth cap, and the only one that measures what a run *costs* rather than how many of them there
were. An analysis of a 400-word posting and one of a six-page posting are both "1" to `capAnalyses`,
and they are not the same work.

**Nothing is stored.** `users.cap_tokens` is a cap; everything else is measured — usage as a SUM
over `ai_runs` (which has recorded real input and output tokens since M1), top-ups as a SUM over
`token_grants`. There is no counter to decrement, so no crash between two writes can drift the
balance, and a run that dies half-way costs exactly the tokens it burned. Same rule that removed the
analyses refund path in M7.

**Estimates exist for one job: the pre-flight check.** ~20,000 for a full run (3,600 reading / 4,800
matching / 8,400 rewriting / 3,200 preparing) and 1,600 for a drafted answer. A run we cannot afford
to finish is never begun — stopping half-way still spends what it burned, and charging for a résumé
nobody received is the failure this feature exists to prevent. The UI says "about".

**The carry rule.** A cycle draws from the plan allowance first and only then from top-ups, so the
pool is touched only by the amount a cycle went *over*. Past overruns are computed by bucketing
`ai_runs` into 30-day windows in one grouped query — measured, like everything else here, rather
than tracked in a `topup_spent` column two writes could disagree about. Past cycles are settled
against the *current* cap (D9): we keep no history of cap changes, and inventing one would be a
bigger lie than the approximation, which errs toward leaving the member more tokens.

**The wall.** One dialog, three exits, free one first:

1. **Park it** — the posting is stored with `analyses.queued_at` set and waits on `/analyze` with a
   button. It does **not** start itself. There is no worker and no cron (§8), so promising an email
   from a scheduler we do not run would be a promise that cannot happen; the dialog says so in those
   words. Re-checked on start: being queued never bypasses the wall.
2. **Top up once** — a pack, on paid plans (F17).
3. **Move up a plan** — derived from the `PLANS` order, absent on the top tier.

Nothing upgrades itself and nothing part-runs an analysis to fit the balance. The refusal carries
the whole wall as a value (`TokenWall`) on the `token_wall` error, so the dialog is rendered from
the same object the enforcement raised and cannot describe a different wall than the one that
stopped the run.

**Two enforcement seams, guarding different things.** `createAnalysis` decides whether a posting is
filed at all; `POST /api/analyze/[id]` is what a parked run, a reloaded tab and a retried request
all have to pass, and is the only check between a `parsing` row and four billed model calls. It
answers 402 with the wall as JSON — this is not a stage that broke, it is a run that never started.

**The header pill** shows the balance on every signed-in page, so the meter is visible before it
matters. It goes accent once, at under two runs left, and stays there — chrome that cries wolf every
few runs is chrome nobody reads. `/profile` carries the paragraph behind it: the estimates and what
each analysis in this cycle *actually* drew, side by side.

**One interruption, once per cycle.** At under two runs left a banner says so under the header and
is then dismissible for that cycle, keyed on the reset date in `localStorage`. The pill is the
permanent display; this is the single moment we interrupt. A banner that returned on every page load
would teach the member to close it without reading, which is worse than never having warned them.
The server half decides whether it is warranted and the client half whether it has already been
shown, so the balance itself never reaches the browser as data.

**The cycle anchor.** `users.quota_resets_at` is a fixed point the 30-day windows are laid out
around, written once at provisioning and never moved — there is no scheduler to move it (§8).
`cycleStart` therefore walks in **both** directions from it: back when the anchor is a future reset
date recorded by hand, forward when it is a signup date months ago. Only walking back was the
original behaviour, and combined with an anchor that was never written it meant every read fell
through to `now` — so usage was counted from that instant, the F15 caps read zero-used and never
bound, and the meter would both have failed to fire and (through the carry rule) treated every
historical `ai_run` as a past cycle that had eaten the top-up pool. The F19 migration backfills the
column from `created_at`.

**Admins** get the token cap in the same per-member panel as the other four, plus a one-off grant
that is deliberately **not** a cap change — unblocking someone today should not also decide what
they inherit next month. Grants land in `token_grants` alongside purchases, so "where did these
tokens come from" has one answer.

**Acceptance:** `cycleStart` puts `now` inside `[start, start + 30d)` for any anchor, past or
future; a member with 4,000 tokens left clicking Analyse gets the dialog and no `analyses`
row; parking that posting creates one row with `queued_at` set and no model call; a redelivered
top-up webhook credits nothing twice; the balance shown equals `SUM(input+output)` over the cycle's
`ai_runs`, checked by hand once at the gate.

### F20 — The walkthrough

Six steps, from the design's `TOUR` array: the token meter, the posting input, the score ring, the
coverage buckets, the tab bar, the draft shelf. A spotlight cut out of a scrim, and a card beside it
carrying a step counter, a title, two sentences and `Skip tour · Back · Next`.

**A step is only shown if its anchor is on the page.** Each one names a `data-tour` key that a real
surface carries — the design is one page where every screen is a state flip, and here they are
routes, so the six are spread across `/analyze` and an analysis. The tour filters to what is
actually in the DOM at the moment it starts, which is why the spotlight can never sit over nothing.
Steps 1–2 live on the upload screen, 1 and 3–6 on a finished analysis.

The header button replays it. From a page with no anchors it hops to `/analyze` first (a session
flag survives the navigation) rather than opening over a surface it can't explain. It auto-starts
once, on `/analyze`, for a browser that hasn't seen it: "seen" is `localStorage`, not a column —
it is a fact about this device, not about the account.

The overlay is `pointer-events: none` and the scrim is the spotlight's own 9999px outer shadow, one
element, so the hole cannot drift away from the control it is cut around. Positions are viewport
space, re-measured on scroll and resize. Escape skips; `←`/`→` step. Under
`prefers-reduced-motion` the spotlight jumps rather than glides.

Wide widths only. Below 860px the controls three of the six steps point at have moved into the
bottom bar and the sheet, so the button goes with them.

**Acceptance:** the spotlight tracks its control through a scroll; a step whose anchor is missing is
never rendered; the tour never blocks a click outside its own card; replay works from any signed-in
surface.

### F21 — Roadmap

A fourth tab on every analysis, `/analysis/[id]/roadmap`: the three result surfaces compiled into
one ordered checklist, one checkmark per step. Every step is compiled from rows the analysis
already holds — `lib/domain/roadmap.ts`'s pure `compileRoadmap(rows)` — and no step is written by
a model (N13). A step that names a question, a learning step, a draft, or a gap carries the
foreign key to that row, never free text; the CHECK on `roadmap_items` makes that mandatory (N14,
§6.2 invariant 8).

Five sections, in order, each omitted entirely when it has no rows rather than padded (RM-2):
**Prepare** (fixed keys — read the coverage buckets, pick a template, download), **Rehearse** (one
step per `likely = true` question), **Deepen** (one step per `technical`/`system_design`
question), **Learn** (one step per learning step, in plan order, plus one per gap that resolved
only to a fallback), **Apply** (fixed keys — apply, follow up after a week — the Apply step binds
to a saved job, F22, when one exists on the analysis).

Completion is user-authored only: `done_at` is set and cleared solely by `setRoadmapItemDone`
(N15). Facts the app already knows — an export exists, an answer was drafted, a saved job's status
changed — render as a hint beside the step, never as a tick. Progress is `n of m`: a count, never
a percentage, never the word "ready" (N16, applying N4's own rule that an honest number beats a
number nobody can source).

Built on demand, one click, at zero token cost — `buildRoadmap(analysisId)` inserts one `roadmaps`
row and N `roadmap_items` and writes no `ai_runs` row. Gated by `capRoadmaps` (§6.2 `users`), per
cycle: Free 1, Pro 40, Ultra 150 — the paid tiers match their analyses caps so every analysis can
carry one. A roadmap already built stays readable and tickable at any cap, including after a lapse
(RM-5) — a cap refuses the next new thing, never what exists (F15's rule, unchanged). At the cap
the tab renders the cap wall (F23), plan exit first.

**Acceptance:** building creates one `roadmaps` row, N `roadmap_items`, zero `ai_runs`; every
non-fixed item resolves to a live row and deleting its source row cascades the item away; ticking
survives reload and is scoped by RLS so a second member cannot tick another member's item; a Free
member's second build in a cycle is refused with the cap wall and creates no row; neither "ready"
nor a percentage ever appears on the tab.

### F22 — Job search

`/jobs`: listings fitted to the profile's stated target titles, skills and location, pulled from
job-board APIs, with save, status tracking, and a one-click path into an analysis. It closes the
loop the other tabs open: find → analyse → roadmap → apply → track.

**Sourcing is documented APIs only — never scraping** (N17). Two adapters ship behind one
interface, `lib/jobs/sources/{adzuna,jooble}.ts` implementing `JobSource { id, search(q, signal),
attribution }`: Adzuna (free key, India plus 15 countries, JSON, a `redirect_url` per listing) and
Jooble (free key, broad India coverage, one POST). Each adapter's terms are read once and its
attribution and rate limits are recorded in its own file before it ships; an adapter with no
documented terms does not ship. Every provider response crosses the boundary through
`JobListingInSchema` (N18) — a malformed record is dropped and counted, never coerced, and never
throws the search. A listing's `url` is always the provider's own field; the app assembles no URL
of its own.

**The query is pure and deliberately narrow** (N19). `lib/domain/job-query.ts` builds a `JobQuery`
from the stored profile alone: titles from `preferences.targetTitles`, falling back to the latest
`work[].position`; the profile's top 8 skills by evidence-citation count, canonicalised; a city and
a remote flag from `basics.location` and `preferences.workMode`. `JobQuery` has no field for a
name, a contact detail, a bullet, a résumé, or a JD — what a model or a log could leak simply
cannot be represented. The query is editable on the page; edits are stored back onto the same
`preferences` object (user-authored, N3).

**Ranking is deterministic** — `lib/domain/job-rank.ts`: skill overlap (canonical profile skills
found in title plus snippet) first, recency second, source order third, no model call. Each result
shows the overlap as named skill chips, labelled "skill overlap" — never a number, a ring, or the
word "match" (N20; N4's own rule again, since a snippet earns no coverage score). Every results
view carries attribution for every source with results (JS-6), unconditionally.

**Analysing a listing.** Provider responses are snippets, not full postings, so **Analyse** opens
`/analyze?listing=<id>` with the snippet pre-filled and a notice that a real analysis needs the
full posting pasted in. The resulting `analyses.listing_id` (§6.2) links the run back to the
listing, which is how the results header's "From your saved job" tag and the roadmap's Apply step
both find it. The app never fetches the employer's own page (N17 again — that would be scraping by
another name).

**Saved jobs** persist at any cap, including Off, because a cap refuses the next new search, never
what a member already saved (mirroring F21's RM-5). Search results are cached server-side by
`query_hash` for 12 hours; a repeat inside the window reads the cache and counts against nothing
(JS-4). Listings expire after 30 days, enforced at read (`where expires_at > now()`), not by a
scheduler — there isn't one (D8).

Gated by `capJobSearches` (§6.2 `users`), per cycle: Free **0** (off entirely — the page renders
the query it would run and the cap wall, and makes zero outbound calls, JS-9), Pro 60, Ultra 200.
A durable ceiling (the cap, counted from `job_searches` rows) plus a burst limit
(`LIMITS.jobSearch`, 12/hour) both apply (N19/JS-3). Listing text is untrusted third-party content:
when it becomes an analysis it gets the same injection handling (G2) as a pasted JD (JS-6). Logs
carry counts and `query_hash` only — never a title, a city, or a company (N19/JS-8, applying N7).

**Acceptance:** a Free member loading `/jobs` triggers zero outbound requests; a Pro search creates
one `job_searches` row, at most 50 listings, and finishes under 8s per source or names the source
that failed; every rendered `url` equals the provider's own field; attribution renders for every
source that returned results; saving, status changes and notes survive the listing's cache expiry
(the FK is `ON DELETE RESTRICT`); nothing beyond counts and `query_hash` is logged.

### F23 — Plan changes

Two new `QuotaKey`s (`roadmaps`, `jobSearches`) join the existing five, each with a column, a
CHECK, a `PLANS` value, a `NOTES` line and an enforcement seam that counts rows (N22) — a plan is
its caps, never a boolean feature flag. `QUOTAS` drives the admin panel, the pricing comparison
table and the webhook from one source, so each surface extends itself once the key exists.

**Plan expiry closes the revenue bug (G7):** a paid plan granted once and never re-checked. `users`
gains `plan_expires_at`, CHECK `(plan = 'free') = (plan_expires_at IS NULL)` (N21, §6.2 invariant
10). A plan purchase extends from `greatest(now(), coalesce(plan_expires_at, now())) + 30 days` —
buying again before expiry adds time, it never overwrites (PAY-1). `lib/domain/entitlements.
effectivePlan(row, now)` is the pure read: expired reads as `free`. Lapse is **settled on read, not
by a scheduler** — every allowance check, and `listMembers`, calls `settlePlan`, which writes the
Free plan, the Free caps and a null expiry back when `effectivePlan` disagrees with the stored row
(PAY-2, PAY-3; this is the mirror of what raising a plan already does on the way up). Direct reads
of `users.plan` or `users.cap_*` outside `lib/auth.ts` and `lib/admin/members.ts` are a bug
(assumption R6, verified by grep at the M8 gate). Read access to everything already generated is
unaffected by a lapse — the pricing page's "you keep read access" line was already the promise.

**The cap wall (G9)** is a second value beside the token wall, same shape: `{ key, label, period,
cap, used, resetDate, resetIn, upgrade, admins }`, carried on a `cap_wall` error and rendered by
`CapWallDialog` from the value alone — never a plain error string for a refusal with somewhere to
go. Exits in order: the cycle reset, the next plan up (`upgrade`), then an admin, where admins
exist (PAY-5). The generic `checkCap(key)` helper backs it, and every cap on every seam — analyses,
answer drafts, roadmaps, job searches — is migrated onto the same wall (M8.4), so no cap refuses
differently from any other.

**The webhook**, on a captured payment: refuses the grant and files a `contact_messages` inbox row
when the amount doesn't match the plan's price, answering 200 either way (the money moved; a
person resolves the mismatch, PAY-4). `plan_purchases.reference` is the idempotency guarantee for
this path (§6.2 invariant 9), the same shape as `token_grants.reference` for top-ups — a redelivery
extends nothing twice. A successful purchase writes all seven caps and the new expiry.

**Renewal is manual in v1** (no Razorpay Subscriptions, D11): the profile panel reads "Pro until 12
Oct · Renew"; a renewal banner shows once, five days out, keyed on the expiry date; the pricing CTA
reads "Renew Pro" for a member already on Pro. Admin cap overrides do not survive a lapse — a
lapsed row is reset to the Free caps exactly as an upgraded row is replaced (D10).

**Acceptance:** a Pro row with a past `plan_expires_at` reads as Free on the next allowance check
and is written back as Free with Free caps; paying twice inside a cycle yields one row with the
expiry extended, not duplicated; a wrong-amount capture grants nothing and appears in the admin
inbox; every cap refusal on every seam returns a `cap_wall` with a plan exit where one exists;
`/pricing` and the admin plan strip print the same seven numbers per plan.

### F24 — Prompt diet

Every instruction gets exactly one home: field shape lives in a schema's `.describe()`, behaviour
lives in the system prompt, enforcement lives in a validator — never two homes for the same rule
(PR-1). A prompt line survives only if removing it changes first-attempt output; "do not invent a
URL" is `noUrls()`'s job, not a sentence's (PR-2). The shared `LAW` block across all seven prompts
collapses to one sentence: *"Nothing is invented: you never add a fact the user did not state."*

**Every call now declares a ceiling.** `runStructured` (renamed `lib/ai/run.ts`'s `runOutcome`
path) refuses to compile without a `maxOutputTokens` (PR-3, G1): extract 6,000 · analyzeJd 3,000 ·
tailor 200 · summary 400 · questions 3,500 · answer 2,500 · plan 2,500. A response the ceiling cuts
short fails schema validation, takes its one corrective retry (PR-4), and then follows the
purpose's existing fallback.

**Per-call inputs are trimmed by pure ranking before the call is made — never by asking a model to
ignore content** (PR-5). `answerQuestion`'s `otherBullets` narrows to the top 12 by term overlap
with the question (`lib/ai/answer.ts`'s `rankByOverlap`). `generateQuestions`'s bullets cap at 40,
ranked by coverage relevance. The JD itself is pre-stripped of boilerplate — benefits, EEO,
"About us" — by `lib/domain/jd-segment.ts`'s `stripBoilerplate()`, a conservative regex on
headings with an absolute floor (not a percentage — a percentage floor reverts stripping on
exactly the short, boilerplate-heavy postings where it matters most) so a real requirements
paragraph is never dropped; the floor/ceiling pair (200 / 20,000 characters) lives in one constant,
`JD_MIN_CHARS`/`JD_MAX_CHARS` in `lib/domain/guardrails.ts`, read by both the client-side submit
check and the server action so the two can never disagree (an earlier client-side floor of 120
characters, stale after this change, was caught and fixed in the same pass). `analyzeJd` and
`extractProfile` retry once, not twice (G14).

**The whole run carries a ceiling too** (G12): `run-analysis.ts`'s tailoring loop carries a
`TokenAccumulator` (the learning engine's own class, reused) with a 60,000-token budget for the
analysis. Past it, remaining bullets are written verbatim rather than left unwritten, stages ④ and
⑤ still run since they're bounded regardless, and the results header names which bullets were left
as written (§9 F4's `truncated`/`protectedNotice` plumbing carries this too). The ceiling is
`ANALYSIS_TOKEN_CEILING` in `lib/domain/tokens.ts`, beside the per-purpose estimates.

Every version bump keeps the old prompt text in the file for one release so `ai_runs.prompt_version`
stays a real axis to compare against (PR-6): `tailor-bullets@2` (schema becomes a single object,
`rationale` dropped entirely since it was never stored or shown), `tailor-summary@2`,
`analyze-jd@2`, `interview-questions@3`, `question-answer@2`, `extract-profile@2`,
`learning-plan@2`. `pnpm tokens:calibrate` prints measured p50/p95 per purpose from `ai_runs`,
`TOKEN_STAGES` is hand-recalibrated from that output after each bump, and the pricing page's "about
N tokens" line derives from the same numbers (PR-6, G11).

**Acceptance:** typecheck fails on any `runStructured` call missing its ceiling; the fabrication
eval stays at zero on every diet prompt, per stage, or that stage's diet reverts and the milestone
still closes (PR-7); the pre-strip fixture set (`pnpm check:jdstrip`) never drops a line containing
a requirement.

### F25 — Guardrail closure

The gap register from the M8–M12 review (G1–G19), closed in the milestone each gap's fix depends
on, plus the guardrails F21 and F22 need that didn't exist before them. A guardrail is code, never
prompt wording alone (GR-1) — the prompt may say the same thing too, only when PR-2's "changes
first-attempt output" test still holds for that sentence.

**Closed:** `maxOutputTokens` required (G1, F24 §5.3) · injection scan moved to `createAnalysis`,
before any row or model call, with the flag stored on `stage_state.injection` and the run
proceeding regardless — containment, not refusal, is the defence (G2, GR-2) · protected-term
scanning moved into stage ① on parsed requirements, before rows are written, with the dropped
notice shown once on the results header rather than computed and discarded (G3 — this was
previously dead code: computed, never rendered, until this pass) · the results header states
plainly when a posting was truncated for length (G4) · one JD length constant used by both the
client check and the server action (G5) · the tailoring tool allowlist scoped to a bullet's own
role rather than the whole profile, and the seniority ladder restricted to title-shaped tokens
rather than any verb that merely sounds senior (G6, re-measured with `check:fabrication`) ·
`deleteEverythingFor`/`deleteAccount` null `contact_messages.clerk_user_id` for the deleted subject
rather than leaving an orphaned reference (G13) · `analyzeJd`/`extractProfile` retries cut from 2
to 1 (G14) · `noUrls(value)` applied to every prose field of every schema through one shared
regex, one place, `lib/domain/guardrails.ts` (G16, GR-3 — course links still come only from the
catalog, N8) · the exports-retention spec text corrected to what the code actually does (G17, §6.3)
· the Clerk `user.created` path and `provisionUser` both read caps through one
`capsFromDefaults()` function, so a raised workspace default reaches an account through either door
(G19).

**New — roadmap (RM-1–RM-5, §9 F21):** no model call anywhere in the compile path, verified by
`ai_runs` staying flat across a build; every non-fixed item's FK matches its `kind`, enforced by
the CHECK; `done_at` is written only by `setRoadmapItemDone`; progress renders `n of m`, never a
percentage or "ready"; every label is a snapshot of a user's own row or a fixed key, never free
text from anywhere else, guaranteed by `compileRoadmap` being pure.

**New — job search (JS-1–JS-10, §9 F22):** documented APIs only, enforced by the adapter interface
and `agent.md`'s never-list; every provider response crosses `JobListingInSchema`, unparseable
records dropped and counted; a listing's `url` is always the provider's own field, never assembled;
`JobQuery` has no field for anything beyond titles, skills, city and a remote flag; fit is skill
overlap, named, never a number or the word "match"; listing text gets the same injection handling
as a pasted JD once it becomes an analysis (G2 covers this too); the durable cap plus the burst
limit plus the 8s/50-listing/one-call-per-source constants; attribution rendered unconditionally
per source; no user id on cached listings, the pairing lives only in `saved_jobs`; logs carry
counts and `query_hash`, never a title or a city.

**New — pay (PAY-1–PAY-5, §9 F23):** the expiry CHECK; lapse settled on read by one function and
nothing else lowering a plan; a mismatched captured amount granting nothing and filing an inbox
row; every cap refusal carrying a `cap_wall` value with the plan as an exit before an admin is; the
plan table and the pricing page reading from one `PLANS` source, the two new keys added there and
nowhere else.

A guardrail that has never been watched rejecting something is not a guardrail (GR-6): every CHECK
above has a case in `scripts/smoke-constraints.ts` (§12), added in the same change as the
constraint itself.

## 10. AI layer

| Purpose | Function | Schema | Tier | Retry |
|---|---|---|---|---|
| Profile extraction | `extractProfile` | `ResumeJsonSchema` | strong | 2, schema-corrective |
| JD analysis | `analyzeJd` | `JdAnalysisSchema` | mid | 2 |
| Tailoring | `tailorBullets` | `TailoredBulletsSchema` | strong | 1, then fail open to original |
| Interview questions | `generateQuestions` | `InterviewQuestionsSchema` | strong | 1 |
| Learning plan | `synthesisePlan` | `LearningPlanSchema` | strong | 1, then degrade to no narrative |

- Every call uses `generateObject` with a Zod schema. The schema is the contract; the prompt is documentation for the model. Schema changes bump `prompt_version`.
- Provider-agnostic — swapping providers is one import change, which is why the SDK was chosen over calling a provider API directly.
- Every call writes an `ai_runs` row. Cost and schema-failure rate observable from day one.
- Low temperature for extraction, moderate for tailoring and question phrasing.
- **Never send the JD and the full profile in one tailoring call.** Scoping to one bullet plus its target requirement measurably reduces cross-contamination between roles.
- Course selection is **not** an LLM call (N8). Neither is gap ranking, skill resolution, level assignment or scheduling — all four are pure functions in `lib/domain/`.
- The learning engine makes **exactly one** model call per run. Adding a second needs a written justification: it would be billed on every run, forever.

**Given light testing, schemas carry more weight than usual.** Prefer narrow schemas, enums over
strings, required over optional. A schema that can't express a wrong answer is worth more than a test
that catches one.

## 11. Non-functional requirements

| Area | Requirement |
|---|---|
| Latency | Import p95 <30s · Full analysis p95 <40s · Single export p95 <3s · Download all p95 <20s |
| Streaming | Anything >3s streams named progress |
| Cost | <$0.35 per full analysis at target model mix; hard monthly per-user quota |
| Privacy | Résumé and JD text are user data. No training use, no third-party analytics on document content. Delete = hard delete of rows + storage objects within 24h. |
| Security | RLS on every user table (§5.3) · service-role key server-only · signed, expiring storage URLs · every Server Action scopes by session subject |
| Uploads | MIME sniffing not extension trust; 5 MB cap; encrypted PDFs rejected with a reason |
| A11y | Keyboard-navigable; tabs and accordions correctly roled; AA contrast — accent is only 3:1 on the ground, so body copy in accent uses `--color-accent-700`. Both themes (F0) carry the same contract; ink on the accent comes from `--color-on-accent`, which inverts. All motion collapses under `prefers-reduced-motion`, including the stage figures (F3) |
| Reliability | LLM failure on one surface degrades that tab, never the whole analysis. A failed Prep tab must not lose the résumés. |

## 12. Verification policy

No continuous test suite, no per-merge tests, no CI gating. Verification is a **manual checklist run
once per milestone**, against a deployed preview. This trades coverage for speed, deliberately.

The consequence: **structural guarantees replace tests.** Constraints, RLS policies and Zod schemas
now do the job tests would otherwise do, and they run on every request for free. So they get
stricter, not looser — prefer `NOT NULL`/`CHECK` over a validation function, enums over strings, and
making a wrong state unrepresentable over remembering to check for it.

**Three checks survive**, each a one-shot manual run at a phase gate:

| Check | Gate | Why it survives |
|---|---|---|
| Constraint smoke test — one bad insert per guard: N1, N2, N4, F19 ×4, RLS, the learning engine's OUT-2 / step-duration / fallback-completeness / severity-range guards, and — added across M8–M11 — F23 ×3 (the two new cap ceilings, a paid plan with no expiry), N14 (a roadmap item's FK mismatching its kind), F22 (an "applied" saved job with no date), and RLS re-checked across six own-rows/no-policy tables instead of one. 17 insert cases + 6 RLS reads = 23 cases. | M1, re-run at each of M8/M10/M11's gates | Confirms the safety net is actually connected. Five minutes, once per milestone that adds a guard. |
| Fabrication eval — 30 bullets vs postings demanding absent skills | M4 | This is the product's entire promise. Unverified, we ship a claim we never checked. |
| DOCX round-trip — export, re-import, compare | M6 | Parsability is invisible until a user is rejected because of it. |

Everything else is verified by looking: render the PDF and open it, click the flow.

**The learning engine's own pure functions are the exception the operating manual allows**
(`agent.md` §4): the resolver and the deterministic scorers get checked as they are written, because
they are pure, the checks are three lines each, and every number the user sees downstream depends on
them being right. The fuzzy-match threshold in `lib/domain/resolve.ts` was set from a measured
separation between real typos and real non-canonical terms, and the measurement is recorded in the
comment beside it — a threshold chosen by feel is a threshold nobody can re-derive.

## 13. Error and edge cases

| Case | Behaviour |
|---|---|
| Scanned/image JD or résumé | Detect empty text layer → explain → offer paste. No OCR in v1. |
| Encrypted PDF | Reject with a clear reason. |
| Uploaded file isn't a JD | Detect during analysis, say so, don't produce nonsense. |
| JD is 4,000 words of boilerplate | Truncate to requirements regions; tell the user what was used. |
| Non-English | v1 English only; detect and say so plainly. |
| Profile has zero bullets | Block analysis — the tool has nothing to work from. |
| Model returns an unknown bullet id | Validation failure → one corrective retry → verbatim fallback. |
| Fewer than 4 gaps | Show what exists. Never pad the Learning tab. |
| No course for a gap | Honest "no vetted course yet" state. Never invent a link. |
| Quota exhausted | Full read access to past analyses. Never lock a user out of their own data. |
| Career gap in dates | Surfaced neutrally at review. Never auto-concealed. |
| Supabase unreachable mid-analysis | `analyses.status='failed'` with the completed stages preserved; **Pick it up again** resumes at the first stage with nothing persisted (F3). |

## 14. API surface (Server Actions unless noted)

```
uploadResume(file)                    → { documentId, extractionStatus }
extractProfile(documentId)            → ResumeJson (draft, uncommitted)
commitProfile(draft)                  → { profileId, bulletCount, yearsExperience }
updateProfile(patch)                  → ResumeJson
replaceResume(file)                   → upload → review → commit

createAnalysis(input)                 → { analysisId, queued } // streamed pipeline; `queue` parks it (F19)
                                                            //   input.listingId binds the run to a saved
                                                            //   job (F22 §3.5); optional
startQueuedAnalysis(analysisId)       → { id }               // F19, re-checks the meter
discardQueuedAnalysis(analysisId)     → null                 // F19
getAnalysis(analysisId)               → full result tree
regenerateTab(analysisId, tab)        → partial re-run, one surface
updateTailoredBullet(bulletId, text)  → TailoredBullet
exportDraft(draftId, format)          → { signedUrl }
exportAll(analysisId)                 → { zipSignedUrl }
listAnalyses(cursor)                  → History page
deleteAccount()                       → hard delete of rows + storage objects
POST /api/webhooks/clerk              → user lifecycle

sendContactMessage(prev, formData)    → ContactState        // F13, public — no session
updateMemberCaps({ clerkUserId, caps, suspended })          // F15, re-reads role server-side
updateWorkspaceDefaults(caps)                               // F15, new accounts only — never an existing row
startPlanCheckout(planId)                   → RazorpayOrder // F17, amount read server-side
startTopupCheckout(topupId)                 → RazorpayOrder // F19, refused on Free server-side
grantTokens({ clerkUserId, tokens })        → { tokens }    // F19, admin one-off — NOT a cap change
POST /api/webhooks/razorpay                    (route)      // F17/F19/F23, the ONLY place users.plan is
                                                            //   raised, plan_expires_at extended, or
                                                            //   token_grants/plan_purchases written from
                                                            //   a purchase
requestAdminAccess()                  → files a support message

buildRoadmap(analysisId)              → { roadmapId }        // F21, cap → checkCap('roadmaps'); zero ai_runs
setRoadmapItemDone(itemId, done)      → RoadmapItem           // F21, the ONLY writer of done_at (N15)

searchJobs(query)                     → { searchId, listings } // F22, cap → checkCap('jobSearches');
                                                            //   burst-limited; cached by query_hash 12h
saveJob(listingId)                    → SavedJob              // F22
unsaveJob(listingId)                  → null                  // F22
setSavedJobStatus({ listingId, status, appliedAt? })         // F22, CHECK requires appliedAt when 'applied'
```

## 15. Open decisions

| # | Decision | Recommendation | Trigger |
|---|---|---|---|
| D1 | Multiple master profiles | No in v1 — the draft set covers most of the need | If users create duplicate accounts |
| D2 | Cover letters | Defer. Same evidence engine, new renderer | Post-v1 |
| D3 | Mock interview practice | Defer. Big surface, different product | Post-v1 |
| D4 | Course catalog scale | ~150 curated entries covering the top 40 skills, manual | If gap coverage drops below 80% |
| D5 | Embedding-based matching | Candidate generation only; never status assignment | Only if alias maintenance becomes the bottleneck |
| D6 | Pricing | Three tiers metered in tokens, not feature gating | Settled at F19 |
| D8 | A scheduler for queued runs | No. A parked run waits on `/analyze` with a button | If parked runs routinely go unstarted for days |
| D9 | Per-cycle cap history | No. The top-up carry rule uses the current cap for past cycles | If an admin's cap change is ever disputed over a top-up |
| D7 | Adding automated tests | Add if the same bug is fixed twice | A second regression |
| D10 | Admin cap overrides on a lapsed account | Lost on lapse — the row resets to Free caps, same as it's replaced on upgrade | An admin asks twice |
| D11 | Razorpay Subscriptions | No in v1; manual renew with a banner | Renewal rate < 50% after two cycles |
| D12 | JSearch (paid) as a third job source | Off until Adzuna + Jooble coverage for the top 20 India target titles is measured < 70% | The R4 measurement |
| D13 | Auto-build the roadmap for Pro at run end | No; on demand for everyone, one click, zero cost | Pro members ask for it |

## 16. What would make this fail

1. **Extraction quality.** If onboarding mangles a résumé, everything downstream is wrong and the user leaves at step one. Riskiest component → built first (`plan.md` M0).
2. **Tailoring that sounds like AI.** Generic corporate rewriting is worse than the original. The bar is *defensible in an interview*, not *impressive on a page*.
3. **Generic interview questions.** "Tell me about a time you failed" for any posting is worthless. Questions must be visibly derived from *this* posting and *this* profile, or the tab is decoration.
4. **A stale or hallucinated course catalog.** One dead link and the Learning tab is never trusted again.
5. **The score drifting into an "ATS score".** The honest coverage number is the differentiator.
6. **A token meter that disagrees with the bill.** The balance is measured from `ai_runs`, never stored, so it cannot drift — but the carry rule for top-ups approximates past cycles with the *current* cap (D9). If cap changes become frequent, that approximation becomes a number a member can argue with.
7. **A missing RLS policy.** With light testing and multi-tenant résumé data, one table shipped without RLS is the highest-severity failure available. Every new table gets a policy in the same migration — no exceptions.

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
- **Tab 1 — Resumes:** six tailored drafts across three template families, evidence-bound, with per-draft diff, preview, Compare two, Download all
- **Tab 2 — Prep:** ten likely interview questions, four flagged highly likely, each with type, why they ask, a three-point answer framework, and the profile evidence to pull from
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
| Database | Supabase Postgres | Accessed via Drizzle; RLS on every user table |
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

### 6.2 Relational schema (Drizzle / Supabase Postgres)

The JSON document is the *portable* form; the tables are the *operational* form — because N1/N2 need
real foreign keys, and JSONB cannot enforce them.

**Every table below carries `clerk_user_id text NOT NULL` and has RLS enabled** with the policy in
§5.3. Given the light verification policy (§12), these constraints are the primary safety net.

```
users
  clerk_user_id text PRIMARY KEY, email_hash, plan, quota_remaining, created_at

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

resume_drafts                          -- six per analysis
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
  type enum('behavioral','technical','situational','gap','culture')
  text, likely bool, why_they_ask text, frame text[]
  evidence_bullet_ids uuid[], source_requirement_id → jd_requirements null
  CHECK (type = 'gap' OR array_length(evidence_bullet_ids,1) > 0)

skills                                 -- canonical vocabulary. Public read.
  id, name, category, aliases text[]

skill_gaps
  id, clerk_user_id, analysis_id, skill_id → skills
  user_level     enum('none','exposure','working','strong')
  required_level enum('exposure','working','strong','expert')
  mention_count int, note text

courses                                -- CURATED catalog. Public read. Never model-generated.
  id, provider, title, url, price_label, length_label,
  level enum('beginner','intermediate','advanced'), mark text,
  skill_ids uuid[], is_free bool, verified_at date

exports
  id, clerk_user_id, draft_id, format enum('pdf','docx','zip'),
  storage_path, bytes, created_at

ai_runs
  id, clerk_user_id, analysis_id, purpose, model, prompt_version,
  input_tokens, output_tokens, latency_ms, schema_valid bool, retry_count, created_at
```

**Invariants**

1. `tailored_bullets.source_bullet_id` is `NOT NULL`, `ON DELETE RESTRICT`. A bullet without provenance cannot exist. N1, enforced by Postgres rather than by a prompt.
2. `interview_questions` CHECK enforces N2: evidence, or explicitly a gap question.
3. `experience_bullets` is written only by user action and by the reviewed onboarding import.
4. `original_text` is snapshotted, so editing the master profile never silently rewrites past analyses.
5. RLS is enabled on every table carrying `clerk_user_id`. `templates`, `skills` and `courses` are reference data with public read and no write policy for authenticated users.

### 6.3 Storage layout

```
resumes/{clerk_user_id}/{document_id}.{ext}      private, signed URL on read
exports/{clerk_user_id}/{analysis_id}/{draft_id}-{template}.{pdf|docx}
exports/{clerk_user_id}/{analysis_id}/all.zip
```

Storage RLS policies mirror the table policies: path prefix must match the requesting subject.
Retention: `exports` objects expire after 90 days (re-render is cheap and deterministic);
`resumes` persist until the user deletes the account or replaces the résumé.

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
  ③ tailor          → 6 × resume_drafts + tailored_bullets
  ④ interview       → 10 × interview_questions
  ⑤ gaps + courses  → skill_gaps + deterministic course match

RESULTS
  score header + 3 buckets
  ├─ Resumes   6 drafts · Compare two · Download all
  ├─ Prep      10 questions · 4 filters · expandable
  └─ Learning  4 gaps by mention_count · 2 courses each
  → Preview [template] → diff · Still not evidenced · See courses → Learning
```

**Why coverage has no LLM:** the score is the number the user trusts to make a decision. It must be
deterministic, reproducible and explainable line by line.

## 9. Feature specifications

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

Segmented control: **Upload file** / **Paste text**.

- Drop zone with drag states (`dzBg`, `dzBorder`, `dzTitle`, `dropGood`/`dropBad`) — PDF, DOCX or TXT up to 5 MB.
- Paste mode: textarea with live `charCount` and **Load sample JD**.
- Design's demo affordances ("Try: a valid posting / an unreadable file") ship behind a dev flag, not in production UI.
- Error region (`errorTitle` + `error`) renders inline in accent-800 on accent-100, never a toast.
- Primary action **Analyze job description**, disabled until input is valid.

**Acceptance:** identical JD text (by `content_hash`) reuses the prior analysis, no second charge.

### F3 — Parsing screen

Spinner, `progressPct` bar, four named steps resolving in sequence (`s.label`, `s.color`, `s.mark`,
`s.dotBg`): *Reading the posting → Matching against your profile → Rewriting your resume → Preparing
questions and courses.* Streamed, never a fake timer. A stage failure stops there and says what
failed — a spinner that lies is worse than an error.

### F4 — Coverage + score header

`Analysis complete · {jdSource}` with extracted JdMeta, the score ring, verdict, note, and three
bucket cards with counts and tags.

**Acceptance:** every **Strong match** tag traces to a specific bullet in one click.

### F5 — Tab 1: Resumes ("Six drafts, same evidence")

Six cards: thumbnail by family, name, `pages`, `kind` tag, `ATS {rating}` badge. Plus **Compare two**
and **Download all**. `tailorSummary` states in one line what changed across all drafts.

Per draft: rewritten evidence-bound bullets, section ordering, skills reordered to lead with
JD-relevant ones the profile actually contains, summary line assembled only from existing claims.

**Guardrails**
- A rewrite introducing a metric, tool, or seniority level absent from the source fails validation.
- Every returned `source_bullet_id` is verified against the input set. Invented id → one corrective retry → verbatim fallback.
- Numbers only if present on the source bullet.

**Acceptance:** the M4 fabrication eval passes at zero (§12).

### F6 — Preview + diff

Full-page preview of the actual template family, with **All templates**, **Edit content**,
**Download DOCX**, **Download PDF**, a template switcher, and a right rail: `cur.name`, `cur.blurb`,
kind tag, ATS tag, **What changed for this posting** (`changes`), and **Still not evidenced**
(`missing`) with **See courses for these** linking into the Learning tab.

That cross-link is the product's best moment: the preview admits what it can't cover and hands the
user the fix. Do not remove it.

### F7 — Tab 2: Prep

Ten questions from the responsibilities and the profile gaps; four flagged **Highly likely**. Four
filter pills. Each expands to **Why they ask**, a three-point **Answer framework**, and **Pull from:**
the profile evidence.

- Non-gap questions must cite evidence (N2), enforced by CHECK.
- Gap questions coach honest positioning — what to lean on instead, what you're doing about it. Never a fabricated credential.
- The framework is scaffolding, not a script. Copy should say so.

### F8 — Tab 3: Learning

"Four requirements your resume can't yet evidence, **ordered by how often the posting mentions
them**." Mention count is the honest proxy for what the employer cares about, and it comes free from
JD analysis.

Per gap: skill, level tag, note, `You` vs `Required`, `Mentioned N×`, and two course cards (provider
mark, title, price, length, level, **View course**).

**Course catalog (N8).** Curated, version-controlled in `lib/catalog/courses.ts`, seeded into the
`courses` table. Never model-generated. Seed sources: **roadmap.sh** tracks per domain, official free
tutorials and vendor academies, hand-verified free video courses; paid options only where no credible
free path exists, clearly labelled. Each row carries `verified_at`; a quarterly link-check is a real
maintenance cost, accepted rather than pretending live generation is cheaper.

Matching is deterministic: skill overlap → level fit → free-first → shortest.

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

**Acceptance**
- PDF text is selectable (select-all highlights every character).
- DOCX opens in Word and Google Docs with styles intact, no repair prompt.
- Round-trip (§12) recovers ≥95% of fields.

### F10 — History

Past analyses: company, title, score, date, status. Opens stored results — no regeneration, no
re-billing. Master profile edits never rewrite past analyses (§6.2 invariant 4).

## 10. AI layer

| Purpose | Function | Schema | Tier | Retry |
|---|---|---|---|---|
| Profile extraction | `extractProfile` | `ResumeJsonSchema` | strong | 2, schema-corrective |
| JD analysis | `analyzeJd` | `JdAnalysisSchema` | mid | 2 |
| Tailoring | `tailorBullets` | `TailoredBulletsSchema` | strong | 1, then fail open to original |
| Interview questions | `generateQuestions` | `InterviewQuestionsSchema` | strong | 1 |
| Gap notes | `describeGaps` | `SkillGapsSchema` | mid | 1 |

- Every call uses `generateObject` with a Zod schema. The schema is the contract; the prompt is documentation for the model. Schema changes bump `prompt_version`.
- Provider-agnostic — swapping providers is one import change, which is why the SDK was chosen over calling a provider API directly.
- Every call writes an `ai_runs` row. Cost and schema-failure rate observable from day one.
- Low temperature for extraction, moderate for tailoring and question phrasing.
- **Never send the JD and the full profile in one tailoring call.** Scoping to one bullet plus its target requirement measurably reduces cross-contamination between roles.
- Course selection is **not** an LLM call (N8).

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
| A11y | Keyboard-navigable; tabs and accordions correctly roled; AA contrast — accent is only 3:1 on the ground, so body copy in accent uses `--color-accent-700` |
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
| Constraint smoke test — one bad insert per guard (N1, N2, RLS) | M1 | Confirms the safety net is actually connected. Five minutes, once. |
| Fabrication eval — 30 bullets vs postings demanding absent skills | M4 | This is the product's entire promise. Unverified, we ship a claim we never checked. |
| DOCX round-trip — export, re-import, compare | M6 | Parsability is invisible until a user is rejected because of it. |

Everything else is verified by looking: render the PDF and open it, click the flow.

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
| Supabase unreachable mid-analysis | `analyses.status='failed'` with the completed stages preserved; resume rather than restart. |

## 14. API surface (Server Actions unless noted)

```
uploadResume(file)                    → { documentId, extractionStatus }
extractProfile(documentId)            → ResumeJson (draft, uncommitted)
commitProfile(draft)                  → { profileId, bulletCount, yearsExperience }
updateProfile(patch)                  → ResumeJson
replaceResume(file)                   → upload → review → commit

createAnalysis(input)                 → { analysisId }        // streamed pipeline
getAnalysis(analysisId)               → full result tree
regenerateTab(analysisId, tab)        → partial re-run, one surface
updateTailoredBullet(bulletId, text)  → TailoredBullet
exportDraft(draftId, format)          → { signedUrl }
exportAll(analysisId)                 → { zipSignedUrl }
listAnalyses(cursor)                  → History page
deleteAccount()                       → hard delete of rows + storage objects
POST /api/webhooks/clerk              → user lifecycle
```

## 15. Open decisions

| # | Decision | Recommendation | Trigger |
|---|---|---|---|
| D1 | Multiple master profiles | No in v1 — six drafts cover most of the need | If users create duplicate accounts |
| D2 | Cover letters | Defer. Same evidence engine, new renderer | Post-v1 |
| D3 | Mock interview practice | Defer. Big surface, different product | Post-v1 |
| D4 | Course catalog scale | ~150 curated entries covering the top 40 skills, manual | If gap coverage drops below 80% |
| D5 | Embedding-based matching | Candidate generation only; never status assignment | Only if alias maintenance becomes the bottleneck |
| D6 | Pricing | Free tier by analyses per month, not feature gating | Before launch |
| D7 | Adding automated tests | Add if the same bug is fixed twice | A second regression |

## 16. What would make this fail

1. **Extraction quality.** If onboarding mangles a résumé, everything downstream is wrong and the user leaves at step one. Riskiest component → built first (`plan.md` M0).
2. **Tailoring that sounds like AI.** Generic corporate rewriting is worse than the original. The bar is *defensible in an interview*, not *impressive on a page*.
3. **Generic interview questions.** "Tell me about a time you failed" for any posting is worthless. Questions must be visibly derived from *this* posting and *this* profile, or the tab is decoration.
4. **A stale or hallucinated course catalog.** One dead link and the Learning tab is never trusted again.
5. **The score drifting into an "ATS score".** The honest coverage number is the differentiator.
6. **A missing RLS policy.** With light testing and multi-tenant résumé data, one table shipped without RLS is the highest-severity failure available. Every new table gets a policy in the same migration — no exceptions.

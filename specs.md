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
  quota_remaining int                -- superseded by cap_analyses; no longer read
  quota_resets_at timestamptz        -- anchors the rolling 30-day cycle

workspace_settings                     -- F15. Operator config, not user data. One row,
  id text PRIMARY KEY DEFAULT 'workspace'   -- CHECKed to that single value
  cap_analyses, cap_resumes, cap_answers, cap_courses int  -- same bounds as users, CHECKed
  updated_at timestamptz
  -- The caps a NEW account is provisioned with. RLS is ON with NO policy: no
  -- anon or authenticated request has business reading it, and the admin path
  -- goes over the Prisma connection, which bypasses RLS.

contact_messages                       -- F13. The one table whose subject may be NULL:
  id, clerk_user_id text NULL, name, email, subject, body, created_at
  -- the contact page is public, so a signed-out sender has no subject to key on.
  -- Those rows are written over the Prisma connection and read by the service
  -- role only; through the anon client the rule is own-rows as everywhere else.

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
resume/{clerk_user_id}/{document_id}.{ext}       private, signed URL on read
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
  ├─ Prep      12 questions · family tabs · expandable · worked answer on demand
  └─ Learning  4 gaps by mention_count · 2 courses each
  → Preview [template] → diff · Still not evidenced · See courses → Learning
```

**Why coverage has no LLM:** the score is the number the user trusts to make a decision. It must be
deterministic, reproducible and explainable line by line.

## 9. Feature specifications

### F0 — Shell and theme

Sticky header on the ground (not a raised surface): brand mark, `New analysis · History · Profile ·
Admin · Status`, theme switch, role label, Clerk user button.

`Admin` is shown to every member, not only to admins. A link that quietly isn't there teaches nobody
anything; a 403 that names the missing permission and the people who hold it (F15) is the more useful
outcome of the same click.

**Footer**, on every surface including the public ones: the mark and the one-line promise, then three
columns — Product (`New analysis · History · Profile · Status`), Company (`How it works · Privacy ·
Contact`) and Support us — over a rule carrying `Terms · Privacy · Changelog`. The dot beside `Status`
is live: it renders only when a stage is actually degraded, from the same aggregate F14 reads. A
decorative pulse next to the word "Status" would be the exact lie that page exists to prevent.

**Theme.** Light and dark, switched by `data-theme` on the html element. Dark is the same roles at the
same ramp steps re-derived on a dark ground — a variable override in `globals.css`, never a `dark:`
variant in components, so anything reading a token is theme-agnostic by construction (N9). Ramps keep
their direction in both themes: `100` is always the tinted-fill end, `900` always the text-on-tint end.

- `--color-on-accent` carries the ink that sits *on* the accent. It has to invert: white on the
  lighter dark-mode accent is ~2:1.
- Preference is stored in `localStorage` and resolved by a synchronous script in `<head>`. No stored
  preference falls through to `prefers-color-scheme`, not to light.
- Only the ground and the ink cross-fade. Nothing else transitions colour, so the switch reads as one
  movement.

**Acceptance:** no flash of the wrong theme on hard reload; the switch survives navigation and reload;
export output is unaffected (a résumé is the user's document, not a Roleform surface).

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

`Step 1 of 3 · The posting` → *"One résumé in, six tailored out"*. Two columns: the posting goes in the
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

**Stage figures.** Each stage carries a small looping diagram of the work it is doing: a page under a
scan line, requirements wired to the bullets that evidence them (and one wired to nothing), a bullet
being typed while two others swap places, questions and course cards forming. They answer what a
progress bar can't — *what* is taking the time. They are the only looping animations in the app, only
one is mounted at a time, they are `aria-hidden`, and the whole set freezes under
`prefers-reduced-motion`. The accessible account of progress is the stage list and the progressbar.

### F4 — Coverage + score header

`Analysis complete · {jdSource}` with extracted JdMeta, the score ring, verdict, note, and three
bucket cards with counts and tags.

Below it, the three surfaces as an underline tab bar carrying a count each — `Résumés 6`,
`Interview prep 10`, `Learning 4 gaps`. The counts are read before the tab is opened on purpose: a
surface that generated nothing is visible as empty from here rather than after a click (§11
Reliability). Real links, so a tab is shareable and the back button behaves.

**Acceptance:** every **Strong match** tag traces to a specific bullet in one click.

### F5 — Tab 1: Resumes ("Six drafts, same evidence")

Six cards: thumbnail by family, name, `pages`, `kind` tag, `ATS {rating}` badge, plus **Download all**.
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
export, on white paper — with **All six drafts**, **Download DOCX**, **Download PDF**, a six-chip
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

### F8 — Tab 3: Learning

"Four requirements your resume can't yet evidence, **ordered by how often the posting mentions
them**." Mention count is the honest proxy for what the employer cares about, and it comes free from
JD analysis.

Per gap: skill, level tag, note, `Mentioned N×`, and two course cards (provider mark, title, price,
length, level, **View course**).

`You` vs `Required` is drawn rather than described: one track, a filled bar for the level the profile
evidences and a tick for the level the posting asks for. The two enums differ (`none…strong` against
`exposure…expert`) but measure the same quantity, so `lib/domain/levels.ts` puts them on one five-rung
ordinal scale. It is a position on that scale, not a percentage of skill.

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

One screen over the whole corpus, because the corpus is one thing. Two columns: identity and
contact, summary, skills, experience, then education / certifications / languages / preferences;
aside carries profile strength and the checks that explain it. The AI layer writes to none of it
(N3) — that is what makes the fabrication guard mean anything.

**The evidence label is the point.** Every bullet and every skill says how often it has actually
been cited by a draft, counted from `tailored_bullets`. A bullet at zero is either badly written or
about work nobody is hiring for, and either way it is the next thing to fix. Two counting rules
matter and both are easy to get wrong:

- **Per analysis, not per row.** One run renders a bullet into six templates. Counting rows says
  "used 6×" for a bullet used once, and climbs six at a time for work done once.
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

`/how-it-works`, `/privacy`, `/terms`, `/changelog`, `/support`. Public — no session. A promise you
have to create an account to read is not a promise you can act on, and privacy is the promise this
product most needs to make in writing.

Content lives in `lib/content/` rather than a CMS, because each page is a commitment the code has to
keep: when §3's fabrication boundary moves, "What we can't tell you" moves in the same commit.

- **How it works** is the four stages, each with what it *refuses* to do. The refusals are set as a
  list, not buried in prose — they are the load-bearing sentences.
- **Changelog** records fixes as plainly as features, tagged `Release · Feature · Improvement · Fix`.
- **Support us** publishes where the money goes, labelled **planned allocation** rather than a report,
  because we have not taken a quarter of money yet. Presenting a forecast as a result is the same
  class of lie as an "ATS score" (N4).

**Acceptance:** all five render signed out; no page claims a number it cannot source.

### F13 — Contact

Public form → Zod → `contact_messages`. Stored, not sent: there is no mail provider wired in, and a
form that says "sent" while dropping the message would be worse than no form. The confirmation says
*filed*, and names the address we will reply to.

Prefill comes from Clerk when there is a session — never from us. We hold a hash of the address (N7)
precisely so we cannot read one back.

**Acceptance:** a message under 20 characters is refused with a reason; six in an hour is refused with
the direct address; the row survives with `clerk_user_id` null for a signed-out sender.

### F14 — Status

`/status`, public. Per-stage health for the four-stage pipeline, **derived, never authored**: each
stage's state is read back out of `ai_runs` over the last hour — degraded at ≥20% schema-invalid or a
mean of ≥1 corrective retry. Under five runs a stage reports Operational *and says the sample is too
small to be a verified one*; "unknown" dressed up as "healthy" is the failure this page exists to
avoid. Matching runs no model at all (`lib/domain/coverage.ts` is pure), so it says it has no worker
to degrade.

**Parked run.** For a signed-in viewer, the newest analysis still in `parsing`. Progress is counted
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
anything. Both the gate and the member list read Clerk directly; the 403's "who can grant it" list
reads Clerk too, because the mirror only refreshes when a person visits and an admin who hasn't
signed in since being granted the role would otherwise be missing from exactly the screen that
points at them.

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
| `capResumes` | `writeDrafts` | Renders the highest-ATS templates first. Below six is fewer drafts, never worse ones. |
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

**View as a member.** `/admin?view=member` renders the 403 for someone who holds the permission, so
an admin can read what a refusal actually says before a member does. The request-access button is
inert there — filing a request against yourself would put a lie in the other admins' inbox.

**Workspace name.** `NEXT_PUBLIC_WORKSPACE_NAME` names the admin kicker ("Admin · Acme workspace")
and the 403's admin list ("Admins on Acme"). Unset is a supported state, not a placeholder: both
fall back to generic wording rather than print an invented company name onto someone's 403.

**403.** A member reaching `/admin` gets a screen naming the permission, what they can still do with
their own numbers in it, and which admins can grant it — plus a request button that files a support
message rather than inventing a notification path. Once filed, the confirmation names the admins it
went to rather than saying only "Sent".

**Acceptance:** a member cannot change another member's caps through the action even with a forged
payload (the role is re-read server-side); a cap of 0 renders as "Off" and refuses with a sentence,
not an error code.

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

Two plans, `free` and `pro` (₹400/month), matching the `PlanTier` enum. **A plan IS its four caps.**
Each row of the comparison table is a `QuotaKey` and the number beside it is the number enforced at
that cap's own seam (F15) — there is no prose describing a limit in words, because a sentence and a
constraint drift and the sentence is the one people read before paying.

| | Free | Pro |
|---|---|---|
| JD analyses | 10 / month | 40 / month |
| Résumés rendered | 2 / analysis | 6 / analysis |
| Full answer drafts | Off | 40 / month |
| Course matches | 2 / gap | 4 / gap |

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

sendContactMessage(prev, formData)    → ContactState        // F13, public — no session
updateMemberCaps({ clerkUserId, caps, suspended })          // F15, re-reads role server-side
updateWorkspaceDefaults(caps)                               // F15, new accounts only — never an existing row
startProCheckout()                          → RazorpayOrder // F17, amount read server-side
POST /api/webhooks/razorpay                    (route)      // F17, the ONLY place users.plan is raised
requestAdminAccess()                  → files a support message
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

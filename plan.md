# plan.md — Roleform

**Ordering principle:** riskiest first, then a thin end-to-end skeleton, then depth.
Discovering a fatal problem at 90% completion is the most expensive mistake available.

**Verification:** one manual checklist per milestone, at the gate, on a deployed preview. No test
suite, no CI gating. Three one-shot checks survive (M1, M4, M6) — see `specs.md` §12 for why each
one earns its keep.

Every task has a **verifiable done-state**. "Auth works" is not one. "User logs in, refreshes, stays
logged in" is.

---

## Milestone map

```
M0  DE-RISK      extraction + PDF/DOCX render on Vercel            ~3 days   ← first, always
M1  SKELETON     Clerk + Supabase + RLS, one ugly path end to end   ~5 days
M2  PROFILE      onboarding import + review + profile               ~5 days
M3  ANALYSIS     JD input → requirements → coverage → score         ~5 days
M4  RESUMES      six drafts, evidence-bound, preview + diff         ~8 days
M5  PREP+LEARN   questions + gaps + course catalog                  ~7 days
M6  EXPORT       templates, zip, CloudFront, round-trip             ~5 days
M7  HARDEN       history, quotas, privacy, domain, launch           ~5 days
```

Roughly 5–6 weeks at evenings/weekends pace. M1 gained a day for the Clerk↔Supabase RLS wiring —
worth paying up front, because with light testing the RLS policies *are* the security model.

---

## M0 — De-risk (do not skip, do not reorder)

Three things could invalidate the architecture. Prove them in throwaway code first.

| # | Spike | Done-state |
|---|---|---|
| M0.1 | Extraction fidelity | **5 real résumés**, including one two-column and one design-tool export. `unpdf` + `mammoth` → `generateObject(ResumeJsonSchema)`. **Done when:** ≥90% of bullets recovered and correctly attributed on 4 of 5. If it fails, the review screen becomes a full manual-entry path and M2 reshapes. |
| M0.2 | PDF on Vercel | Hardcoded résumé through `@react-pdf/renderer` in a **deployed** Server Action. **Done when:** function under the size limit, renders <1s, select-all in the downloaded PDF highlights every character. |
| M0.3 | DOCX round-trip | Generate with `docx`, re-import through M0.1. **Done when:** ≥95% field recovery, Word opens it without a repair prompt. |

**Gate:** all three green before M1. If M0.2 fails, fallback is a print-stylesheet + browser
print-to-PDF flow — worse UX, but it ships. Decide at the gate, not later.

---

## M1 — Skeleton, auth, and the security model

| # | Task | Done-state |
|---|---|---|
| M1.1 | Next.js 15 + TS strict + Tailwind + shadcn; `organic` tokens as CSS variables | `pnpm build` clean, deployed to Vercel; a test page renders in Caprasimo/Figtree on the cream ground |
| M1.2 | Three Supabase projects: local / preview / production | Separate connection strings per Vercel environment. Preview cannot reach production data |
| M1.3 | Clerk auth | Sign up, sign in, refresh, stay logged in; protected route redirects |
| M1.4 | **Clerk ↔ Supabase native third-party integration** | Clerk domain registered in Supabase; session token carries `"role": "authenticated"`; an authenticated Supabase query succeeds and an anonymous one is denied |
| M1.5 | `public.clerk_user_id()` SQL helper | Returns the `sub` claim. **`auth.uid()` is not used anywhere** — it returns a UUID and Clerk subjects are strings |
| M1.6 | Prisma schema from specs §6.2 + `db/policies.sql` | Migration applied. RLS enabled on every table carrying `clerk_user_id`. Policies live in the repo, applied by migration — never clicked into the dashboard |
| M1.7 | Storage buckets `resumes` / `exports`, both private | Path-prefix policies mirror table policies |
| M1.8 | `lib/supabase/{client,admin,storage}.ts` | `admin.ts` is server-only; confirm it does not appear in any client bundle |
| M1.9 | **★ Constraint smoke test** (one of the three surviving checks) | Attempt and confirm rejection of: an insert into `tailored_bullets` with null `source_bullet_id`; a non-gap `interview_questions` row with empty evidence; a cross-user `select` under RLS. Five minutes, once, never repeated |
| M1.10 | Hardcoded profile → hardcoded JD → 1 tailored bullet → 1 question → PDF download | A logged-in user clicks once and gets a PDF containing one evidence-bound bullet |

**Gate:** M1.9 all three rejections confirmed. This is the moment the safety net either exists or
doesn't — and with no test suite, there is no second chance to notice.

The skeleton stays alive from here. After every later task, this path must still work end to end.

---

## M2 — Onboarding and profile

| # | Task | Done-state |
|---|---|---|
| M2.1 | Upload → `resumes` bucket → `source_documents` | 5 MB cap, MIME sniffed not extension-trusted, encrypted PDF rejected clearly |
| M2.2 | `extractProfile` + `ResumeJsonSchema` | Schema-valid on all 5 M0 résumés; `ai_runs` row per call |
| M2.3 | **Mandatory review screen** | Every field editable beside the raw text; nothing commits without explicit confirm |
| M2.4 | Commit → `master_profiles` + atomized `experience_bullets` | Each `highlights[]` entry becomes exactly one row with a stable id |
| M2.5 | Profile card + Replace resume | Renders `filename · Parsed · N yrs · N skills` from real data |
| M2.6 | Profile editor | Add/edit/reorder/delete bullets; autosave; refresh preserves everything |
| M2.7 | No-text-layer detection | Image-only PDF produces an explanatory message, not silent garbage |

**Gate:** a stranger goes from "PDF on my desktop" to "correct profile in the app" in under 5 minutes
without help. Do this with an actual person, not from memory.

---

## M3 — Analysis: JD → coverage → score

| # | Task | Done-state |
|---|---|---|
| M3.1 | Step 1 UI: upload / paste segmented control | Drag states, `charCount`, Load sample JD, inline error region (not a toast) |
| M3.2 | JD ingest → `analyses` with `content_hash` | Re-submitting identical text reuses the prior analysis; no second charge |
| M3.3 | `analyzeJd` → JdMeta + requirements | 12–25 deduped requirements on a typical 600-word posting, each with `evidence_quote`, `necessity`, `mention_count` |
| M3.4 | Skill canon + alias table | ~200 seeded aliases ("JS"→"JavaScript", "RTL"→"React Testing Library") |
| M3.5 | `lib/domain/coverage.ts` — pure, no I/O | Runs against fixtures from a script; no mocking needed because there's no I/O to mock |
| M3.6 | Score function | Exactly the formula in CLAUDE.md §4. Sanity-check by hand on three fixtures: all-evidenced → 100, all-absent → 0, mixed → the number you'd compute on paper |
| M3.7 | Parsing screen | 4 named steps with real per-stage state, streamed. A stage failure stops there and says what failed |
| M3.8 | Results header + 3 buckets | Every Strong-match tag expands to its source bullet in one click. **No "ATS score" label anywhere** |

**Gate:** feed it a posting you're clearly unqualified for. Output must be useful and honest, not
discouraging noise.

---

## M4 — Tab 1: Resumes (the core)

This gets the creativity budget. Everything else can be excellently boring.

| # | Task | Done-state |
|---|---|---|
| M4.1 | `tailorBullets`, scoped one bullet + one requirement per call | Never sends the full profile with the JD in one call |
| M4.2 | **Id verification layer** | Every returned `source_bullet_id` checked against the input set. Invented id → one corrective retry → verbatim fallback |
| M4.3 | Content guardrails | A rewrite introducing a metric, tool, or seniority level absent from the source fails validation |
| M4.4 | Six drafts across three families | Cards render name, pages, kind, and a **computed** ATS badge |
| M4.5 | `lib/render/ats-rules.ts` rating function | Pure. Creative templates honestly rate Low |
| M4.6 | Preview page + `changes` diff | Changes highlighted **by default**, not behind a toggle |
| M4.7 | "Still not evidenced" → **See courses** cross-link | Deep-links to Learning, filtered to those skills |
| M4.8 | Compare two | Side-by-side, scroll-synced |
| M4.9 | **★ Fabrication eval** (one of the three surviving checks) | 30 bullets × postings demanding absent skills. **Zero** fabricated tools, metrics, or titles. Read all 30 outputs by hand — this is the one place manual reading is worth the hour |

**Gate:** M4.9 passes at zero. If not, tighten schemas and call scoping — not prompt wording.
Prompt-level fixes to a structural problem are how this class of bug returns.

---

## M5 — Tabs 2 and 3: Prep and Learning

| # | Task | Done-state |
|---|---|---|
| M5.1 | `generateQuestions` → 10 questions, 4 likely | Each has type, why-they-ask, 3-point framework, evidence |
| M5.2 | Evidence enforcement (N2) | Non-gap question with empty evidence rejected by the DB CHECK — already confirmed at M1.9 |
| M5.3 | Gap-question framing | Reviewed against 10 gap cases — zero scripted false claims |
| M5.4 | Filters + accordion | 4 filter pills; keyboard-accessible accordion with correct ARIA roles |
| M5.5 | `skill_gaps` ordered by `mention_count` | Visibly correct against a posting that repeats one skill |
| M5.6 | **Course catalog seed** | ~150 curated entries, top 40 skills, `verified_at` set, seeded into `courses`. Sources: roadmap.sh tracks, official free tutorials, hand-verified free video courses. Paid only where no credible free path exists, labelled |
| M5.7 | Deterministic course matching | `lib/catalog/match.ts` — pure. Skill overlap → level fit → free-first → shortest |
| M5.8 | Empty states | <4 gaps shows what exists, never pads. A gap with no vetted course shows an honest empty state, never an invented link |

**Gate:** run 5 real postings and read the questions. Every one must be visibly derived from *that*
posting. If a question would fit any job, the tab is decoration — fix the prompt scoping.

---

## M6 — Export and delivery

| # | Task | Done-state |
|---|---|---|
| M6.1 | `ats-rules.ts` as shared constraint source | Both renderers import from here |
| M6.2 | 6 DOCX templates | Named paragraph styles; open clean in Word and Google Docs |
| M6.3 | 6 matching PDF templates | Designed to react-pdf's constraints (flexbox, no Grid, no pseudo-selectors) — not ported from web CSS |
| M6.4 | Exports → `exports` bucket, signed URLs | Path prefix scoped per user; 90-day expiry on objects |
| M6.5 | Download all → zip | 12 files. **Measure p95** — this is the queue trigger in CLAUDE.md §12 |
| M6.6 | CloudFront in front of `exports` at `files.koustubh.org` | Bucket stays private; CloudFront handles distribution and TTLs only. **The app is NOT proxied through CloudFront** |
| M6.7 | **★ DOCX round-trip** (one of the three surviving checks) | Export → re-import through M2.2 → ≥95% field recovery. Run once, by hand |
| M6.8 | Select-all check | Open each of the 6 PDFs, select all, confirm every character highlights |
| M6.9 | Filename convention | `Firstname-Lastname-Company-Role-Template.docx` |

**Gate:** print all six on paper. If they look like templates, they need another pass — this is the
artifact a human actually judges.

---

## M7 — Harden and launch

| # | Task | Done-state |
|---|---|---|
| M7.1 | History | Lists past analyses; opens stored results with no regeneration and no re-billing |
| M7.2 | Quotas | Monthly analysis limit; exhaustion leaves all past analyses fully readable |
| M7.3 | Per-tab degradation | A failed Prep generation does not lose the résumés. Verify by fault injection |
| M7.4 | Privacy | Hard delete of rows + storage objects within 24h; PII redacted from logs — verified by reading an actual log line |
| M7.5 | **Domain cutover** | Route 53: `roleform.koustubh.org` CNAME → Vercel, `files.koustubh.org` → CloudFront. HTTPS on both, no mixed content, no redirect loop |
| M7.6 | Clerk production instance | Production keys, allowed origins set to the real domain, webhook endpoint verified |
| M7.7 | Cost dashboard | Per-user and per-purpose spend from `ai_runs`; alert threshold set |
| M7.8 | A11y pass | Full flow keyboard-only; tabs and accordions correctly roled; body copy in accent uses `--color-accent-700` |
| M7.9 | Rate limiting | Per-user and per-IP on all LLM endpoints |
| M7.10 | Catalog link-check script | Manual quarterly run; flags dead URLs and stale `verified_at` |

**Gate:** the RLS re-check. Log in as two users and confirm neither can read the other's analyses,
exports, or profile. With light testing this is the one thing worth verifying twice — once at M1 when
the policies are written, once at M7 after seven milestones of new tables.

---

## Learning track

Learn it the week before you need it, not upfront. Your Angular + TypeScript depth transfers
directly; the gaps are React's mental model, the server side, and applied AI.

**Useful coincidence:** the roadmap.sh and free-course research you do for your own gaps is the same
research that seeds M5.6's catalog. Keep notes in the catalog's column format from day one —
provider, title, url, price, length, level, skills — and half the seed data builds itself.

### Before M1 — React, Next.js App Router, Supabase

Biggest shift from Angular: no DI container, no modules, no RxJS-by-default. Rendering *is* the
architecture.

- **roadmap.sh/react** — skim; focus on hooks and rendering.
- **roadmap.sh/nextjs** — the actual gap. Server Components, App Router, Server Actions.
- **nextjs.org/learn** — official, project-based (dashboard app), covers App Router, Server Components, data fetching, streaming, auth. Documentation-driven; assumes React knowledge, which fits.
- **Scrimba — Learn Next.js** (free, ~4.4 hrs, interactive) if you want something more guided than docs.
- **freeCodeCamp** on YouTube — search "Next.js 15 full course". Verify it covers App Router and Server Components; Pages Router content is outdated for new projects.
- **Supabase docs → Auth → Third-party → Clerk**, and **Clerk docs → Integrations → Supabase**. Read both, not one. They're short, and M1.4/M1.5 fail confusingly if you skip them.
- **Supabase docs → Row Level Security.** Read this one properly. With no test suite, RLS is your security model, and it's the only part of M1 where a quiet mistake stays quiet.

> Angular trap: you will reach for a service + DI for shared state. In App Router most of that state
> shouldn't be client state at all. Resist the port.

### Before M2/M3 — Data and API design

- **roadmap.sh/backend** — API design, auth, caching sections.
- **roadmap.sh/postgresql-dba** — first third only: schema design, indexes, constraints. Constraints matter more than usual here — N1, N2 and RLS are doing the work tests would otherwise do.
- **roadmap.sh/api-design** — full pass; most reusable skill on this list.
- **Prisma docs** — short and good, no video needed. Skip the ORM comparison rabbit hole.

### Before M4/M5 — Applied AI engineering

The real gap, and where the product's value sits.

- **roadmap.sh/ai-engineer** — the *applied* branch: prompting, structured output, evals. Not the ML-theory branch; you're building with pre-trained models, not training them.
- **Vercel Academy** (`vercel.com/academy`) — free and directly on-target: an AI-powered summary app with Next.js App Router and the AI SDK covering structured output, caching, and production patterns. Closest free resource to what you're building.
- **AI SDK v5 tutorial series** — `youtube.com/playlist?list=PLC3y8-rFHvwhZHH2BksCOYAxLmYrQL__H`. AI integration in Next.js 15, prompt engineering, structured output.
- **AI SDK docs** — read `generateObject` and the Zod schema pages properly. Most load-bearing API in the codebase; with light testing, schema design *is* your correctness strategy.
- **daveebbelaar/ai-cookbook** (`roadmaps/ai-engineer-2026.md`) — the framing that matters most: effective AI systems use *as little AI as possible*, combining deterministic logic with LLMs. Already baked in here — coverage, scoring, ATS rating and course matching are all deterministic.

### Ongoing

- **roadmap.sh/system-design** — one section per week alongside the build, never as a blocker.

**Discipline:** one resource per gap, finished. Three half-watched playlists teach less than one
completed tutorial.

---

## Definition of done — whole project

1. A stranger goes from uploading their résumé to downloading a tailored DOCX in under 10 minutes without instructions.
2. The fabrication eval (M4.9) passes at zero.
3. Every non-gap interview question resolves to real profile evidence.
4. Every course link resolves; none was model-generated.
5. The DOCX round-trip (M6.7) recovers ≥95% of fields.
6. Two users cannot see each other's data (M7 gate).
7. Every Strong-match tag traces to its evidence in one click.
8. The word "ATS" appears only on template badges, never attached to the match score.
9. Cost per full analysis under $0.35 at target model mix.
10. Account deletion removes rows *and* storage objects. Verified by hand, once.

---

## Known weakest points

**1. Extraction fidelity on unusual layouts.** Everything downstream depends on it and it has the
least control — hence M0.1 first. Below 90%, the honest response is to make manual entry a
first-class path and say so in the product's own copy. Costs about a week and reshapes M2.

**2. Interview question quality.** Structurally guarded (N2 forces evidence) but not quality-guarded —
a question can cite real evidence and still be generic. There's no automated test for "this was
written for this job," and under the light-testing policy there won't be one. M5's gate is manual
review of 5 real postings and should stay manual. If it keeps failing, ship Prep smaller and sharper —
four excellent questions beat ten forgettable ones, and the design's "four flagged highly likely"
already suggests where the value sits.

**3. Regressions, structurally.** Light testing means a break in M3 may not surface until M6. The
mitigation isn't a test suite — it's the walking skeleton. Run the full path end to end at the end of
every working session, not just at gates. It takes two minutes and it's the entire early-warning
system.

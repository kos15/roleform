# CLAUDE.md — Roleform

> Operating contract for any AI agent working in this repo. Read fully before the first edit.
> Uppercase filename because that is what Claude Code loads. Do not rename.
> Design source of truth: `JD Resume Builder.dc.html` + `_ds/organic-*`.

---

## 1. What this is

**Roleform** takes a job description and a stored résumé profile and returns three things:

1. **Six tailored résumés** across ATS-safe, sidebar and creative templates
2. **Likely interview questions** with answer frameworks
3. **Skill gaps and the courses that close them**

The design states the product's law in its own copy, on the upload screen:

> *"We retarget this resume against the posting. **Nothing is invented** — bullets are reordered,
> reworded and re-weighted."*

That sentence is the spec. Everything below enforces it.

**Spine:** the user's career facts live in exactly one place. A posting is a lens that selects,
orders, and rephrases them. It never invents them — and that applies to interview answers and gap
analysis as much as to résumé bullets.

## 2. Non-negotiables

| # | Rule | Why |
|---|---|---|
| N1 | Every generated résumé bullet references the `experience_bullet.id` it derives from. FK is `NOT NULL`. | Fabrication becomes structurally impossible, not prompt-policed. |
| N2 | Every interview question has non-empty `evidence_bullet_ids` **or** is explicitly typed `gap`. The UI's `Pull from:` line must never render empty. | Same guard, second surface. |
| N3 | The AI layer never writes to `master_profiles` or `experience_bullets`. User-authored only. | One source of truth. |
| N4 | The match score is **requirement coverage**, defined in §4. Never label it "ATS score"; never render it without its three buckets beside it. | It's an honest number or it's a lie. |
| N5 | A template's `ATS` badge is computed from structural rules (§5), never hand-assigned. | Creative templates genuinely parse worse. The badge is how we ship them honestly. |
| N6 | All LLM output crosses the boundary through a Zod schema via `generateObject`. Never `JSON.parse` a raw completion. | Wrong states unrepresentable. |
| N7 | No PII in logs, traces, or error reports. | Résumés are the most sensitive document most users own. |
| N8 | Course recommendations come from a curated catalog. Never a model-generated URL. The learning plan's Zod schema has no URL field at all, so the model has nowhere to put one; the serialiser reads every URL from the database. | A hallucinated course link destroys the Learning tab's credibility in one click. |
| N11 | A `SkillGap` may carry `unlocksBulletDraft` only when `unlocksBulletId` is set (CHECK). Bindings are written **only** by the deterministic binder in `lib/domain/binding.ts`, which returns null rather than reaching for something plausible — never by a model. | A staged rewrite with no source bullet is a claim about a bullet the user never wrote. This was first built as `NOT NULL` bindings on `LearningStep`; measured end to end that withheld vetted material for 5 of 6 gaps while guarding against the wrong thing. The risk is a **false** binding, not an absent one. |
| N12 | The learning engine makes exactly **one** model call per run, and no LLM call in any stage that is a pure function or a DB read. Its retrieval is a primary-key lookup against precomputed bundles, never a search. | Request-time work is billed on every run forever; ingest-time work is amortised across all users. Moving work the wrong way across that line is the one change that breaks the cost model silently. |
| N9 | Every color, font, radius and shadow comes from the `organic` DS tokens. Never hard-code a hex or a px the tokens carry. | The DS readme requires it. |
| N10 | Every table carrying user data has RLS enabled with a policy keyed on the Clerk subject. Server-side scoping is not a substitute. | We test lightly (§11) — structural guarantees carry the load instead. |

## 3. The fabrication boundary

Three legal transformations of a stated fact:

1. **Rephrase** — same claim, the posting's vocabulary.
2. **Reorder / re-weight** — surface the relevant, demote the rest. Nothing is deleted from the profile, only omitted from a draft.
3. **Requantify** — only using numbers already present on the source bullet.

Fabrication includes: inventing metrics, upgrading seniority, adding tools absent from the profile,
merging roles, extending dates, inferring a skill from an adjacent one.

When the posting demands something the profile lacks, it goes to **Not evidenced** → the Learning
tab. The gap is the product, not a defect to paper over.

**This extends to the Prep tab.** A question may probe a gap — that is what gap questions are for —
but the answer framework must never script a claim the user cannot make. For a gap question the
framework coaches honest positioning (what to lean on instead, what you're doing about it), never a
fabricated credential.

## 4. The score — read before touching the dial

The results header shows a ring with a number and the word "match", plus `scoreVerdict` and
`scoreNote`, beside three buckets: **Strong match**, **Partial evidence**, **Not evidenced**.

**Definition — the only one permitted:**

```
score = 100 × ( Σ weight(r) × credit(r) ) / ( Σ weight(r) )   over all r in jd_requirements

weight:  required = 3    preferred = 2    implied = 1
credit:  evidenced = 1.0    partial = 0.5    absent = 0.0
```

Deterministic, computed in `lib/domain/coverage.ts`, no LLM involved, reproducible from identical
inputs. It answers *"how much of this posting can your profile evidence"* — a fact about the user's
own document, which we can honestly know.

**It does not and must not claim:** that any employer's ATS will score this, that it predicts a
callback, or that a higher number means a better application.

`scoreVerdict` and `scoreNote` carry calibration in words. "Strong on delivery, thin on infra" is
right. "78% chance of an interview" is a lie. If a ticket asks for an "ATS score", it is asking for
N4 to be broken — push back.

## 5. ATS rating on templates

Six templates across three families — `classic` (single-column), `sidebar` (two-column), `creative`.
Two-column layouts parse worse in real systems; the badge exists so the user chooses knowingly
instead of being sold a false promise.

Computed in `lib/render/ats-rules.ts` from structural facts, not opinion:

| Rule | Required for **High** |
|---|---|
| Single-column body flow | yes |
| Standard section headings (Experience / Education / Skills / Projects / Certifications) | yes |
| No tables, text boxes, or content in header/footer regions | yes |
| Contact details as body text, not graphics | yes |
| No information conveyed only by icon or color | yes |

All five → `High`. One violation → `Medium`. Two or more → `Low`.
Creative templates will honestly read `Low`. That is correct. Do not tune the rules to flatter them.

## 6. Infrastructure

| Concern | Choice | Notes |
|---|---|---|
| Hosting | **Vercel** | Next.js 15 App Router. Preview deploys per branch. |
| Auth | **Clerk** | Native Supabase third-party integration (§7). |
| Database | **Supabase Postgres** | Accessed through Prisma, via `@prisma/adapter-pg`. RLS on every user table. |
| File storage | **Supabase Storage** | Buckets: `resumes` (private), `exports` (private, signed URLs). |
| DNS / domain | **Cloudflare DNS**, domain `koustubh.org` | App at `roleform.koustubh.org`, `CNAME` → Vercel. Resend's DKIM/SPF live under that name (`resend._domainkey.roleform`, `send.roleform`) and resolve fine — a CNAME only excludes records at its own node. |
| CDN | **Vercel's own edge** for the app · **CloudFront** in front of the `exports` bucket | See below. |

**On CloudFront — read this before wiring it.** Do **not** proxy the Vercel app through CloudFront.
Vercel already runs its own edge network; stacking a second CDN in front adds a latency hop, breaks
ISR and cache invalidation, and makes preview deployments painful. The app's apex/subdomain points at
Vercel directly.

CloudFront earns its place on exactly one path: fronting the Supabase Storage `exports` bucket so
generated résumés are served from `files.koustubh.org` with our own cache policy and TTLs. That's a
real, non-redundant job. Anything beyond that needs a reason.

**Environments:** `production` (`roleform.koustubh.org`), `preview` (Vercel per-branch URLs),
`local`. Each gets its own Supabase project — never point preview at production data. Résumés are
real people's documents.

## 7. Clerk ↔ Supabase — the part that bites

Use the **native third-party auth integration**. The old Clerk JWT-template approach was deprecated
on 1 April 2025 and should not be used in new code; the native path avoids fetching a fresh token per
request and avoids sharing the Supabase JWT secret with Clerk.

**The gotcha:** `auth.uid()` does not work with Clerk. It returns a UUID, and Clerk subjects are
strings. Every RLS policy must read the subject from the JWT claims instead:

```sql
-- helper, defined once
create or replace function public.clerk_user_id() returns text
language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::text
$$;

-- pattern applied to every user-owned table
alter table analyses enable row level security;

create policy "own rows" on analyses
  for all
  using      (clerk_user_id = public.clerk_user_id())
  with check (clerk_user_id = public.clerk_user_id());
```

Rules:
- `users.clerk_user_id` is `text`, not `uuid`. Anything joining to it is `text`.
- The integration supplies the `"role": "authenticated"` claim — requests without it are anonymous and RLS must deny them.
- Server Actions still scope every query by the session subject. RLS is the second lock, not the only one.
- The **service role key never reaches the client** and is used only in trusted server paths (webhook handling, catalog seeding, admin scripts).

## 8. Stack — decided, with reversal cost

| Layer | Choice | Reason | Reversal |
|---|---|---|---|
| Framework | Next.js 15 App Router, TS strict | Server Actions remove most API boilerplate | High |
| UI | Tailwind + shadcn/ui, restyled to `organic` tokens | DS bundle is authoritative | Low |
| ORM | Prisma over Supabase Postgres | Typed schema; migrations in-repo, not dashboard-clicked; swapping the underlying database later is a datasource/adapter change, not a query rewrite | Medium |
| LLM | Vercel AI SDK, `generateObject` + Zod | Provider-agnostic; swap by changing one import | Low — the point |
| PDF | `@react-pdf/renderer` | Chromium ~100 MB vs Vercel's 50 MB function limit; renders <500ms vs 2–5s | Medium |
| DOCX | `docx` (npm) | Real named paragraph styles | Medium |
| Extraction | `unpdf` (PDF), `mammoth` (DOCX), plain read (TXT) | Raw text only; the LLM does the structuring | Low |
| Zip | `archiver` | "Download all" = 6 templates × 2 formats | Low |
| Jobs | None in v1 — inline + streaming | See §10 trigger | Low |

**Not chosen:** Puppeteer (bundle size), LangChain (the AI SDK covers this shape), a vector DB (the
corpus is one user's résumé — there is no retrieval problem), Supabase Auth (Clerk was chosen; don't
run two auth systems), Supabase Edge Functions (the app is on Vercel — keep compute in one place).

## 9. Design system — `organic`

Warm, rounded, a little playful: cream ground, terracotta accent, sage second accent, over-rounded
containers.

- Ground `--color-bg` #f5ead8 · text `--color-text` #201e1d · accent `--color-accent` #c67139 · second accent `--color-accent-2` #7a8a5e
- Ramps 100–900 per role. Light steps (100–300) for tinted fills and hovers, 500 as base, 700–900 for text on tints. **Prefer ramp steps over ad-hoc `color-mix()`.**
- Type: Caprasimo headings (`--font-heading`) over Figtree body (`--font-body`). Caprasimo is the only display voice.
- Radius: `--radius-lg` 28px for containers, `999px` for buttons, inputs and pills.
- Elevation: `--shadow-sm/md/lg` only. No ad-hoc box-shadows.
- Icons: Lucide at **stroke-width 2.75**.
- Focus: `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }`. Never the default blue ring.
- Accent-on-ground is tuned to 3:1 — fine for chrome and large text, **not for body copy**. Use `--color-accent-700` for paragraph text in the accent.
- Direction: left-aligned and asymmetric, flush-left headings, whitespace on the right. Don't crowd — rounded shapes need air.

Use the DS classes (`.btn`, `.tag`, `.card`, `.nav`, `.field`, `.input`, `.seg`, `.table`, `.dialog`)
rather than inventing parallels.

**Export templates are exempt from `organic`.** A résumé is not a Roleform surface — it is the user's
document going to a stranger. Export templates follow §5, not the brand.

## 10. Repo layout

```
app/
  (marketing)/
  (app)/
    onboarding/              resume upload → parse → review → profile   (once)
    analyze/                 Step 1 of 3: JD input → parsing → results  (per session)
    analysis/[id]/
      resumes/  prep/  learning/  preview/[templateId]/
    history/   profile/
  api/                       webhooks only (Clerk)
lib/
  domain/                    PURE. coverage · scoring · ats-rating · ordering · diff
                             + the learning engine's pure half:
                             resolve · severity · selection · plan · binding · guardrails
  ai/
    schemas/                 Zod — the LLM contract lives HERE, not in prompts
    prompts/                 versioned templates
    extract-profile.ts · analyze-jd.ts · tailor.ts · interview.ts
  catalog/
    skills.ts · courses.ts · match.ts · taxonomy.ts · quality.ts
  learning/                  SERVER. the engine's I/O half:
    bundles.ts               precomputed retrieval — a PK lookup, never a search
    build-plan.ts            the S3→S7 request path. ONE model call.
    validate.ts              OUT-1: every resource id resolves to a live row
  render/
    ats-rules.ts · pdf/ · docx/ · zip.ts
  supabase/
    client.ts                anon client bound to the Clerk session
    admin.ts                 service-role client — SERVER ONLY, never imported by a component
    storage.ts               bucket helpers + signed URLs
  db/
    index.ts · policies.sql · queries/
  generated/prisma/          Prisma client output — generated, gitignored, never hand-edited
components/
prisma/
  schema.prisma              the truth · migrations/
```

**Rule:** `lib/domain/` imports nothing from `db`, `ai`, `supabase`, or `next`. If it needs I/O it
belongs a layer up.

**Rule:** `lib/supabase/admin.ts` is server-only. If it ever appears in a client bundle, that is a
security incident, not a bug.

## 11. Verification policy — light by design

We do **not** run a continuous test suite, per-merge tests, or CI gating. Verification happens **once
per milestone, at the phase gate**, as a manual checklist run against a deployed preview.

This is a deliberate trade of coverage for speed. It has a consequence worth internalising:

> With no test suite, the structural guarantees are the safety net. Database constraints, RLS
> policies, and Zod schemas are now doing the job tests would otherwise do — and unlike tests, they
> run on every request for free. So they get **stricter**, not looser.

Which means:
- Prefer a `NOT NULL` / `CHECK` constraint over a validation function.
- Prefer a narrow Zod schema over a permissive one plus a runtime check.
- Prefer an enum over a string.
- Prefer making a wrong state unrepresentable over remembering to check for it.

**Three checks survive, because each catches a failure that would be expensive and silent.** All
three are one-shot manual runs at a phase gate, not suites:

| Check | When | Why it survives |
|---|---|---|
| Constraint smoke test — attempt one bad insert per guard | M1 gate, once | Confirms N1/N2/N10 are actually enforced. Five minutes, never repeated. |
| Fabrication eval — 30 bullets against postings demanding absent skills | M4 gate | This is the product's entire promise. Unverified, we're shipping a claim we haven't checked. |
| DOCX round-trip — export, re-import, compare | M6 gate | Parsability is invisible until a user is rejected by it. |

Everything else is checked by looking at it. Render the PDF and open it. Click through the flow.
That's the standard.

## 12. When to revisit

- **Add a job queue** when "Download all" (12 renders + zip) exceeds the function budget, or p95 analysis passes 45s. Most likely trigger to actually fire — measure at M6.
- **Add automated tests** if the same bug is fixed twice. A second regression is the cheapest possible signal that the light policy has stopped paying.
- **Cache JD analysis** — in v1 via `content_hash`; extend cross-user only if postings genuinely recur.
- **Add embeddings** only if maintaining the skill alias table becomes the bottleneck. Candidate generation only, never status assignment.

## 13. Conventions

- Server Actions by default; route handlers only for webhooks and streaming.
- Zod at every boundary. Types inferred from schemas, never written alongside them.
- `prisma/schema.prisma` is the truth; migrations are generated (`prisma migrate dev`), never hand-authored — except the two CHECK constraints (N1/N2 have no Prisma schema equivalent), which are added by hand to the migration SQL once and never touched again. RLS policies live in `lib/db/policies.sql`, in the repo, applied by script (`pnpm db:policies`) — never clicked into the Supabase dashboard.
- Fixed vocabulary — do not introduce synonyms: `MasterProfile`, `ExperienceBullet`, `Analysis`, `ResumeDraft`, `TailoredBullet`, `InterviewQuestion`, `QuestionAnswer`, `SkillGap`, `Course`, `CourseSkill`, `SkillBundle`, `LearningPlan`, `LearningStep`, `UnresolvedTerm`, `CorpusGap`.
  Note in particular: the learning engine's spec calls a catalogued thing a *resource*; in this repo
  it is a **`Course`**. There is one table, not two — a parallel `Resource` model would be exactly
  the synonym this rule exists to prevent.
- Typed `Result<T, AppError>` in domain and AI layers. Exceptions only for genuinely exceptional states.

## 14. Working style

- Read `specs.md` before implementing; read `plan.md` before choosing what to work on.
- Build the walking skeleton first (plan M1) and keep it alive. Never leave the repo broken across a task boundary.
- Verify at each seam by looking — render the PDF, open the page. Light testing raises the value of actually looking at the output, it doesn't remove it.
- On failure: state what you expected, what happened, and the smallest experiment separating the top two causes. Two failed fixes on one symptom means the mental model is wrong — stop and re-derive.
- State decisions with reasons rather than asking permission. Flag assumptions in one line.
- If a task balloons past its importance to the spine, cut scope and say so.

## 15. Definition of done (per feature)

1. Types check, lint clean.
2. End-to-end path still works: profile → paste JD → analyze → all three tabs → preview → both exports.
3. Exports open cleanly in Word and Preview; PDF text is selectable.
4. No new nullable FK on any evidence relation; RLS enabled on any new user table.
5. No hard-coded hex, font, or radius that a DS token already carries.
6. `lib/supabase/admin.ts` still imported only from server paths.
7. Specs updated if behaviour changed. Docs drift is a bug.

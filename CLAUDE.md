# CLAUDE.md — Roleform

> Operating contract for any AI agent working in this repo. Read fully before the first edit.
> Uppercase filename because that is what Claude Code loads. Do not rename.
> Design source of truth: `Roleform Prototype.dc.html` (Claude Design handoff, Sep 2026).

---

## 1. What this is

**Roleform** takes a job description and a stored résumé profile and returns three things:

1. **Up to eleven tailored résumés** across ATS-safe, sidebar and creative families — how many is `capResumes` per member (§5, F15), eleven by default
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
| N9 | Every color, font, radius and shadow comes from the `marigold` DS tokens. Never hard-code a hex or a px the tokens carry. | The DS readme requires it. |
| N10 | Every table carrying user data has RLS enabled with a policy keyed on the Clerk subject. Server-side scoping is not a substitute. | We test lightly (§11) — structural guarantees carry the load instead. |
| N13 | No model call in the roadmap or the job search. Both are pure functions over rows and one outbound API call. `ai_runs` does not move when either runs. | Request-time cost is billed on every run forever (N12). Neither feature needs a model, so neither gets one. |
| N14 | Every non-fixed `roadmap_items` row carries exactly the foreign key its `kind` names (CHECK). A step about a question points at that question. | A step that names nothing is a claim about work the user never generated. |
| N15 | `roadmap_items.done_at` is written only by the user's own tick. Nothing derived, scheduled or model-written sets it. | N3 applied: completion is a user-authored fact. Hints from rows are shown beside a step, never as a tick. |
| N16 | Roadmap progress is `n of m`. Never a percentage, never "ready", never a prediction. | N4 applied: a count is honest; a readiness score is a number nobody can source. |
| N17 | Job listings come from documented APIs only. No HTML scraping, no headless browser, no fetch of an employer's page, no source without terms read and recorded in its adapter. | Terms, brittleness, blocked egress, poster PII. If the source has no API, the product does not have that source. |
| N18 | Every provider response crosses the boundary through a Zod schema. A listing's `url` is the provider's own field; the app never assembles one. Bad records are dropped and counted, never coerced. | N6 and N8 for third-party data. A URL we built is a link we cannot vouch for. |
| N19 | A job query carries titles, canonical skill names, a city and a remote flag. Never a name, contact detail, bullet, résumé or JD. `JobQuery` has no field for them. | N7 at the egress. Wrong states unrepresentable. |
| N20 | Fit between a listing and the profile is shown as named facts — skills it names, skills it asks for that you lack, title, location, stated years. Listings may be grouped into tiers (Shortlist / Worth a look / Long shot / Ruled out) only by those facts, with the reasons on every card. No number, no ring, no "match". | N4: the match score is coverage over a full posting; a snippet cannot earn it. A tier is a sort, not a score. |
| N21 | A paid plan has an expiry; Free has none (CHECK). Lapse is settled by one function on read. Nothing raises a plan except (a) the webhook on a captured payment of the right amount — the live `plan_configs` price, or the `promo_redemptions` row checkout wrote for that order — or (b) an admin's `assignMemberPlan`, which always sets an expiry and writes an audited `plan_purchases` row (`admin:` reference + `granted_by`, CHECKed). Nothing else lowers a plan. | A plan granted forever for one payment is the revenue bug; an unaudited writer to `users.plan` is the next one. |
| N22 | A plan **is** its caps: every plan-gated capability is a `QuotaKey` with a column, a CHECK, a `PLANS` value, a `NOTES` line and an enforcement seam that counts rows. No boolean feature flags per plan. Site-wide switches (`feature_switches`, F31) are allowed: they open or close a surface for everyone and never vary by plan. A quota may be **internal** — unprinted — only if it is a fair-use ceiling sized so every printed count binds first; the page then says "Fair-use limit applies". Today only `tokens` is internal, and members never see a token number (Oct 2026). | The pricing page prints `QUOTAS`; a gate outside it is a promise the page cannot show and the admin cannot move. |
| N23 | Interview rounds are user-authored facts; reminders are rows derived from them. The sender claims a row before it sends, pushes only label · company · time · an in-app path (never notes), and logs counts. The service worker never caches a signed-in page. Its sender runs on the product's clock (N24). | A reminder is the one thing we do on our own clock — it has to arrive at most once, honest about when, and safe on a lock screen. |
| N24 | Scheduled work is a closed list kept in `lib/services/cron.ts` (`CRON_JOBS`): `/api/cron/reminders` (F29, every 5 min) and `/api/cron/catalog` (F8, daily link re-check against a 7-day TTL). Each is installed by `installSchedule` — `pnpm db:schedule` by hand, `pnpm deploy:schedule` in the build, which every production build runs — and listed by name in middleware. Each checks the shared Bearer `CRON_SECRET` before reading anything, claims a row before acting on it, finishes inside its function limit (`maxDuration`) — stopping new work at its own deadline where the batch can outrun it, makes no model call, writes no user-authored row, and logs counts only. Anything that can be settled on read is settled on read; a new entry must say why it cannot. | A clock is code that runs with nobody watching. Each one is a standing cost and a standing risk, so each is named, bounded and justified. |
| N25 | A production build is the only automated writer of catalog content (the rows built from `lib/catalog`) and of the schedule; N24's daily re-check writes only link liveness (`status`, `checked_at`) and the bundles that follow from it. It runs only when `VERCEL_ENV` is production, link-checks every URL it inserts, and fails the deploy rather than shipping a catalog or schedule it could not write. | A catalog edit that never reaches the database is invisible, and a schedule nobody reinstalled is a silent outage; tying both to the deploy makes them happen exactly when the code that needs them ships. The gate keeps preview builds from writing production-shaped state, and a hash of the rows (`catalog_syncs`) keeps an unchanged catalog from costing a single request. |

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

Eleven templates across eight families — `classic` (single-column), `sidebar` (two-column),
`creative`, `banner`, `timeline`, `modular`, `editorial`, `infographic`. Two-column layouts parse
worse in real systems; the badge exists so the user chooses knowingly instead of being sold a false
promise.

**Never write the count into UI copy.** How many drafts a run returns is `capResumes` per member
(0–11, eleven by default), so any fixed number in a heading is wrong for somebody. Results surfaces
count the drafts they were handed; the analyse screen reads `draftsPerRun`; both clamp through
`draftCount` in `lib/domain/entitlements.ts`, which the pipeline uses too.

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
| UI | Tailwind + shadcn/ui, restyled to `marigold` tokens | DS bundle is authoritative | Low |
| ORM | Prisma over Supabase Postgres | Typed schema; migrations in-repo, not dashboard-clicked; swapping the underlying database later is a datasource/adapter change, not a query rewrite | Medium |
| LLM | One agent per task (`lib/ai/agents/`) on GPT-5 writers via the Vercel AI SDK (`generateObject` + Zod); Jev checkers (TypeSafe, plain `fetch` + Zod) on tailoring and answers | Provider-agnostic writers; checkers add a second, independent lock on fabrication | Low — the point |
| PDF | `@react-pdf/renderer` | Chromium ~100 MB vs Vercel's 50 MB function limit; renders <500ms vs 2–5s | Medium |
| DOCX | `docx` (npm) | Real named paragraph styles | Medium |
| Extraction | `unpdf` (PDF), `mammoth` (DOCX), `word-extractor` (DOC), `fflate` (ODT), pure readers for RTF/HTML/MD/TXT, one vision call for scans and photos (specs F1) | Raw text only; the LLM does the structuring | Low |
| Zip | `archiver` | "Download all" = 6 templates × 2 formats | Low |
| Jobs | None in v1 — inline + streaming. Scheduled work is N24's closed list (F29 reminder sender every 5 min; F8 catalog link re-check daily), both called by Supabase pg_cron (`pnpm db:schedule`) — installed by every production build, not Vercel Cron — one scheduler keeps one list, and Hobby is daily-only. | See §12 trigger | Low |
| Push | `web-push` (VAPID, RFC 8291) + `public/sw.js` | Standard Web Push reaches Android, desktop and iOS ≥16.4 Home Screen apps with no native app | Low |

**Not chosen:** Puppeteer (bundle size), LangChain (the AI SDK covers this shape), a vector DB (the
corpus is one user's résumé — there is no retrieval problem), Supabase Auth (Clerk was chosen; don't
run two auth systems), Supabase Edge Functions (the app is on Vercel — keep compute in one place).

## 9. Design system — `marigold`

Warm, confident, generous with whitespace: cream ground, maroon ink, marigold accent, pink second
accent, over-rounded containers, and condensed uppercase display type. One palette, light only —
the six-palette picker and dark mode were retired with it.

- Ground `--color-bg` #f8f0e3 (the body fades toward marigold down the page) · raised `--color-bg-raised` #fffbf4 · text `--color-text` #4a0d0d · muted `--color-text-muted` #7a5647 · accent `--color-accent` #f9b130 · second accent `--color-accent-2` (the `sage-*` ramp) #ff9dc0
- Ramps 100–900 per role. Light steps (100–300) for tinted fills, 500 as the fill, 600 for the deeper marigold / hot pink, 700–900 walk toward the ink. **Prefer ramp steps over ad-hoc `color-mix()`.**
- Type: Anton headings (`--font-heading`), uppercase, set tight, over Figtree body (`--font-body`). `h1`/`h2`/`.display` are Anton; `h3` stays in Figtree 800 because it titles cards.
- The filled button is maroon with marigold type (`.btn-primary`). Outlined pills and chips use a 1.5px ink border.
- Radius: `--radius-lg` 24px / `--radius-xl` 28px for containers, `--radius-sm` 14px for inputs, `999px` for buttons and pills.
- Elevation: mostly flat. `--shadow-md/lg` only where paper lifts off the ground (résumé thumbnails, hover lift). No ad-hoc box-shadows.
- Icons: Lucide at **stroke-width 2.25**.
- Focus: `:focus-visible { outline: 2px solid var(--color-accent-600); outline-offset: 2px }`. Never the default blue ring.
- Marigold is a fill, not a text colour. Text on marigold or pink is the ink; paragraph text in the accent uses `--color-accent-700`.
- Direction: left-aligned and asymmetric, flush-left headings, whitespace on the right. Don't crowd — rounded shapes need air.

Use the DS classes (`.btn`, `.tag`, `.card`, `.nav`, `.field`, `.input`, `.seg`, `.table`, `.dialog`, `.eyebrow`, `.progress`, `.note`)
rather than inventing parallels.

**Export templates are exempt from `marigold`.** A résumé is not a Roleform surface — it is the user's
document going to a stranger. Export templates follow §5, not the brand.

## 10. Repo layout

Every kind of thing has one folder. One name per line; `tests/structure/claude-md.test.ts` fails
if any entry here is not on disk, and `tests/structure/layout.test.ts` fails if something lands
outside it.

```
app/
  (marketing)/               public pages
  (app)/
    onboarding/              resume upload → parse → review → profile (once)
    analyze/                 JD input → parsing → results (per session)
    analysis/
      [id]/                  resumes · prep · learning · roadmap · rapid · portfolio · rounds · preview
    history/
    profile/
    jobs/
    admin/                   operator surfaces (F31)
  actions/                   Server Actions
  api/
    webhooks/                Clerk, Razorpay
    cron/                    reminders (F29) · catalog (F8) — Bearer CRON_SECRET, N24
  offline/                   the service worker's offline page (public, static)
components/
lib/
  domain/                    PURE. coverage, scoring, ordering, the learning engine's pure half
  ai/
    openai/                  models.ts · run.ts · usage.ts — the only home of @ai-sdk/openai
    typesafe/                Jev checkers over fetch: fabrication · answer claims · injection (fail open)
    system-prompts/          one file per SYSTEM prompt · shared.ts (LAW, STYLE) · versions.ts
    prompts/                 one user-message builder per agent · assemble.ts
    schemas/                 Zod — the LLM contract lives HERE, not in prompts
    agents/                  one definition per task + runAgent, the only door to a writer
    services/                thin task wrappers the app calls: analyze-jd · tailor · interview · …
  admin/                     operator reads and writes (members, plans, inbox)
  services/                  SERVER. feature I/O
    auth.ts                  session, plan settlement, cap walls
    cron.ts                  N24 closed list of scheduled jobs · cronAuthorised
    features.ts              F31 site-wide switches — requireFeaturePage (404) / requireFeature (action)
    account/                 F33 greeting name
    extract/                 résumé text extraction (specs F1)
    jobs/                    F22 job search over documented APIs only
    learning/                the learning engine's I/O half: bundles (PK lookup) · build-plan (ONE model call) · validate · refresh-catalog (daily link re-check)
    mail/
    payments/                Razorpay
    pipeline/                the analysis run
    plans/                   F31 live plan catalog — every price read goes here
    promo/                   F32 price a code, list banners
    push/                    F29 send (SERVER ONLY) · dispatch · outbox · client (browser, no server imports)
    status/
  shared/                    utils · email-hash · sample-jd — imported by client and server alike
  catalog/                   skills · courses · taxonomy · liveness
  drill/                     F26 curated DSA bank · QuickJS sandbox
  render/                    ats-rules · pdf · docx · portfolio · zip
  supabase/
    client.ts                anon client bound to the Clerk session
    admin.ts                 service-role client — SERVER ONLY, never imported by a component
    storage.ts               bucket helpers + signed URLs
  db/
    index.ts
    policies.sql
    queries/
  generated/                 Prisma client output — generated, gitignored, never hand-edited
  seo/                       site facts, metadata, JSON-LD, Markdown mirrors, llms.txt
  content/                   public copy and guides — every claim must match the rules the code enforces
tests/                       Vitest, mirrors lib/ · tests/structure/ holds the repo-shape rules
scripts/
  db/                        policies, cron schedule (N24), constraint smoke test, admin grants
  catalog/                   seed, bundles, link and corpus checks, drill bank
  deploy/                    production-build steps: catalog sync, schedule (N25) — gated on VERCEL_ENV
  ops/                       icons, push keys, IndexNow, render samples, DOCX round-trip
  evals/                     agent evals (pnpm eval)
  tools/                     move-modules codemod + its maps
docs/
  product/                   PRD · specs · plan · planning · rules · agent
  learning-engine/           the learning engine's spec, guardrails and prompts
  superpowers/               design specs and implementation plans
prisma/
  schema.prisma              the truth
  migrations/                generated; never edited after apply
PENDING.md                   every pending item; struck through when done
.claude/
  agents/                    the agent team (§16) — one file per agent
```

**Rule:** `lib/domain/` imports nothing from `db`, `ai`, `services`, `supabase`, or `next` — except
types from `lib/ai/schemas`, which are pure Zod. If it needs I/O it belongs a layer up.

**Rule:** `lib/supabase/admin.ts` is server-only. If it ever appears in a client bundle, that is a
security incident, not a bug.

## 11. Verification policy — test-driven (since Oct 2026)

Every behaviour change starts with a **failing test** in `tests/` (Vitest, `pnpm test`). Watch it
fail, make it pass, then commit. `pnpm test` and `pnpm typecheck` are green before every commit.
Tests mirror the module they cover (`lib/domain/lanes.ts` → `tests/domain/lanes.test.ts`);
repo-shape rules (layout, import boundaries, this file's paths) live in `tests/structure/`.
`server-only` resolves to `scripts/server-only-stub.ts` under Vitest so server modules are testable.

Tests do not replace the structural guarantees — database constraints, RLS policies and Zod
schemas run on every request for free, so they stay **strict**:
- Prefer a `NOT NULL` / `CHECK` constraint over a validation function.
- Prefer a narrow Zod schema over a permissive one plus a runtime check.
- Prefer an enum over a string.
- Prefer making a wrong state unrepresentable over remembering to check for it.

**Three checks need a database, the network or a model, so they stay scripts** run at a phase gate
rather than in `pnpm test`:

| Check | When | Why it survives |
|---|---|---|
| Constraint smoke test — attempt one bad insert per guard | M1 gate, once | Confirms N1/N2/N10 are actually enforced. Five minutes, never repeated. |
| Fabrication eval — 30 bullets against postings demanding absent skills | M4 gate | This is the product's entire promise. Unverified, we're shipping a claim we haven't checked. |
| DOCX round-trip — export, re-import, compare | M6 gate | Parsability is invisible until a user is rejected by it. |

Visual output is still checked by looking at it as well: render the PDF and open it, click
through the flow.

## 12. When to revisit

- **Add a job queue** when "Download all" (12 renders + zip) exceeds the function budget, or p95 analysis passes 45s. Most likely trigger to actually fire — measure at M6.
- **Cache JD analysis** — in v1 via `content_hash`; extend cross-user only if postings genuinely recur.
- **Add embeddings** only if maintaining the skill alias table becomes the bottleneck. Candidate generation only, never status assignment.

## 13. Conventions

- Server Actions by default; route handlers only for webhooks and streaming.
- Zod at every boundary. Types inferred from schemas, never written alongside them.
- `prisma/schema.prisma` is the truth; migrations are generated (`prisma migrate dev`), never hand-authored — except the two CHECK constraints (N1/N2 have no Prisma schema equivalent), which are added by hand to the migration SQL once and never touched again. RLS policies live in `lib/db/policies.sql`, in the repo, applied by script (`pnpm db:policies`, run by every build) — never clicked into the Supabase dashboard.
- Fixed vocabulary — do not introduce synonyms: `MasterProfile`, `ExperienceBullet`, `Analysis`, `ResumeDraft`, `TailoredBullet`, `InterviewQuestion`, `QuestionAnswer`, `SkillGap`, `Course`, `CourseSkill`, `SkillBundle`, `LearningPlan`, `LearningStep`, `UnresolvedTerm`, `CorpusGap`,
  and for rapid prep (F26) `RevisionDeck`, `QuizRound`, `CodingChallenge`, `CodeAttempt`,
  and for the portfolio (F28) `PortfolioSite`,
  and for rounds and reminders (F29) `InterviewRound` (with its `RoundKind`), `RoundReminder`, `PushSubscription`,
  and for durable push (F29.2) `PushDelivery` (the outbox row; "accepted" means the push service took it, never "delivered"),
  and for admin controls (F31) `FeatureSwitch` (with its `FeatureKey`), `PlanConfig` (the live public plan; `PLANS` is only the default),
  and for promos (F32) `PromoCode`, `PromoRedemption` ("captured" means the webhook saw the payment),
  and for deploy-time sync (N25) `CatalogSync` (one row per successful production catalog sync; append-only).
  Note in particular: the learning engine's spec calls a catalogued thing a *resource*; in this repo
  it is a **`Course`**. There is one table, not two — a parallel `Resource` model would be exactly
  the synonym this rule exists to prevent.
- Typed `Result<T, AppError>` in domain and AI layers. Exceptions only for genuinely exceptional states.

## 14. Working style

- Read `docs/product/specs.md` before implementing; read `PENDING.md` (then `docs/product/plan.md`) before choosing what to work on.
- Build the walking skeleton first (plan M1) and keep it alive. Never leave the repo broken across a task boundary.
- Test first (§11), then verify at each seam by looking — render the PDF, open the page.
- All pending work lives in `PENDING.md`. Add a line before the first failing test; strike it
  (`- [x] ~~item~~ — <date>`) in the commit that finishes it. Never delete a line.
- On failure: state what you expected, what happened, and the smallest experiment separating the top two causes. Two failed fixes on one symptom means the mental model is wrong — stop and re-derive.
- State decisions with reasons rather than asking permission. Flag assumptions in one line.
- If a task balloons past its importance to the spine, cut scope and say so.

## 15. Definition of done (per feature)

1. Types check, `pnpm test` green, the feature's tests were written first. `PENDING.md` line struck.
2. End-to-end path still works: profile → paste JD → analyze → all three tabs → preview → both exports.
3. Exports open cleanly in Word and Preview; PDF text is selectable.
4. No new nullable FK on any evidence relation; RLS enabled on any new user table.
5. No hard-coded hex, font, or radius that a DS token already carries.
6. `lib/supabase/admin.ts` still imported only from server paths.
7. Specs updated if behaviour changed. Docs drift is a bug.

## 16. The agent team (since Oct 2026)

Every requirement, bug or analysis runs through these project agents (`.claude/agents/`). The
user asked for this standing workflow, so spawning them is expected, not optional. Each runs
on the model its job needs: thinking where judgment matters, speed where it does not.

| Agent | Naruto ability | Role | Model | Edits files? |
|---|---|---|---|---|
| `ino` | Mind Transfer: reads what you mean | Curates the raw request into a brief: goal, scope, acceptance criteria, constraints, ≤3 open questions | Haiku 5.5 | No |
| `hokage` | The village's final word | Critical, hard-to-reverse architecture only: schema/migrations, RLS/auth, payments, AI cost model, any N-rule | Opus 5.5, effort `high` (`max` for production data, money, security) | No |
| `shikamaru` | IQ-200 strategist | Turns the brief into an exact test-first plan: files, signatures, failing tests, commands | Opus 5.5 | No |
| `kakashi` | Copy Ninja: copies the technique exactly | Writes the code for one planned task: RED → GREEN → full suite. No redesign, no git | Sonnet 5.5 | Yes |
| `neji` | Byakugan: sees every point at once | Reviews against the plan, CLAUDE.md, best practice and test coverage; runs the tests itself | Opus 5.5 | No |
| `jiraiya` | The Sannin who writes everything down | All git: branches, systematic revert-friendly commits, PENDING.md strikes, merges, gated pushes | Sonnet 5.5 | Git + PENDING.md only |

**Flow.**

```
user request
  → ino            brief (+ questions → main session asks the user)
  → hokage         only if ino or shikamaru flags an irreversible call (+ questions → user)
  → shikamaru      plan → saved to docs/superpowers/plans/, lines added to PENDING.md
  → per task: kakashi (code) → neji (review) → kakashi (fixes, if Critical/Important)
  → jiraiya        commit per task; merge and push only when the user asks
```

- Subagents cannot ask the user directly. Questions from `ino` or `hokage` come back to the main
  session, which asks the user before work continues.
- Small, obvious changes (a typo, a one-line copy fix) may skip `ino`, `hokage` and `shikamaru`.
  They never skip a test, `neji`'s review, or `jiraiya`'s commit standard.
- `neji`'s Minor findings go to `PENDING.md`. They do not trigger another coding round.
- `tests/structure/agents.test.ts` pins each agent's model and tool limits.


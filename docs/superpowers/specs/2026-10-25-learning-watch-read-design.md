# Learning tab: Watch | Read lanes, curated videos and docs for every skill

Date: 2026-10-25 · Status: draft for approval

## Intent

A member closing a skill gap wants to learn it **fast but completely**, in the format they prefer.
Some watch, some read. Today each gap shows up to three mixed resources with a two-letter mark;
nothing says at a glance "this is a video" or "this is the official docs", and coverage of videos
and docs across the ~100 catalogued skills is thin (≈90 links total).

This change gives every gap two lanes — **Watch** (YouTube) and **Read** (official docs and known
tutorials) — each with its own icon, backed by a hand-curated set of links for **all ~100 skills**
in `lib/catalog/skills.ts`, re-verified **weekly** so nothing older than seven days is served
unchecked.

## Goals

1. Every skill in the taxonomy has curated **video** and **doc** entries in the catalog.
2. Each gap on the Learning tab renders a **Watch** lane and a **Read** lane, up to two items each.
3. A dedicated icon per lane and per row: YouTube → Lucide `Play` on a pink (`--color-sage-*`)
   circle; docs → Lucide `BookOpen` on a marigold (`--color-accent-*`) circle. Stroke 2.25.
4. Docs carry an **Official** or **Tutorial** tag (react.dev vs MDN guide / roadmap.sh).
5. Every catalog link carries a "checked at" stamp; a weekly job re-checks any row older than 7 days
   and retires dead ones. Members never trigger a fetch.
6. Zero model tokens and zero external calls at request time.

## Non-goals

- Ranking by YouTube's own metrics (views, likes). The member chose **option B**: no Google Cloud
  project, no YouTube Data API key. Can be added later; see "Later".
- Embedding or playing video in-app. A row is a link out.
- Replacing courses (Udemy, Coursera, etc.) — they stay, sorted into the lane their format fits.
- A per-member preference toggle (mockup option C was not chosen).

## Anti-goals (would be a failure even if it works)

- **Any URL a model produced.** N8 forbids it. Links are authored by a human-reviewed list in the
  repo and must pass a live check before they enter the database. A link that cannot be confirmed
  live never ships.
- **Any search or model call on the Learning request path.** N12: retrieval stays a PK lookup over
  precomputed bundles.
- **A removed YouTube video served as "live".** YouTube answers `200` for a removed/private video
  page, so the ordinary HTTP liveness check is wrong for videos (see "Liveness").
- **Hard-coded hex/px.** N9.
- **A lane that silently vanishes.** An empty lane says so ("No vetted videos for this yet") — the
  tab's existing honesty rule (FallbackNote).

## Constraints (from CLAUDE.md, binding)

- N8 curated catalog only; N9 DS tokens; N12 one model call per learning run, no request-time search;
  N17 documented endpoints only — YouTube's public **oEmbed** endpoint
  (`https://www.youtube.com/oembed?url=…&format=json`) is documented and keyless; no HTML scraping.
- N23 currently says `/api/cron/reminders` is the only scheduled path. This design adds a second
  one and **amends N23** (see "Weekly refresh").
- Fixed vocabulary: the catalogued thing is a `Course` (type `video` / `doc` / …). No new
  `Resource`/`Video` model.
- `prisma/schema.prisma` is the truth; migrations generated.
- `lib/domain/` stays pure.

## Decided (by the member)

| Question | Decision |
|---|---|
| Source of video links | Hand-picked (option B). No YouTube API, no Google setup. |
| Doc sources | Both official docs and known tutorials (MDN, roadmap.sh, official getting-started). |
| Layout | **B — Watch \| Read lanes** per gap; stacked on phones. |
| Coverage at launch | All ~100 skills. |
| Cache TTL | One week. |
| Lanes in the plan | **Alternatives.** Budget, plan and roadmap count one pick per gap; the other lane is "or read/watch this instead". |
| Plan quota | `capCourses` counts **per lane**. Free 1+1, mid 2+2, top 3+3. Pricing copy → "videos and docs per gap". |

## How it works

### 1. Catalog data (`lib/catalog/courses.ts`)

- `CourseDef` gains explicit fields instead of URL sniffing:
  - `type: "course" | "video" | "doc" | "repo" | "roadmap"` (required on new entries; `typeOf`
    stays as the fallback for old ones).
  - `docKind?: "official" | "tutorial"` — required when `type === "doc"` (enforced by the seed
    script failing on a missing value).
  - `author` — channel or publisher name ("TechWorld with Nana", "MDN"). Already a column.
- Per skill, target: **2–3 videos** and **2–3 docs** (≥1 official where an official source
  exists). Order of preference inside Watch, to serve "minimum time, all concepts":
  1. a single full-course / crash-course video by a widely known creator for that niche;
  2. a short overview ("in 100 seconds") as a second pick — never first.
- Known-creator allowlist lives beside the list as plain data (e.g. per niche: Fireship,
  freeCodeCamp, Traversy Media, Web Dev Simplified, TechWorld with Nana, Corey Schafer,
  NetworkChuck, Hussein Nasser, ByteByteGo, Academind…). It is guidance for curators and a seed-time
  lint ("author not on allowlist" is a warning, not an error).
- **Authoring the ~400 links:** a builder may draft candidates, but every URL is accepted only after
  the seed's live check passes, and the full list is reviewed by the member before merge. The PR
  carries a per-skill table (skill · lane · author · title · URL) for that review.

### 2. Schema

- `docKind` enum column `doc_kind` (`official | tutorial`), nullable, with a CHECK:
  `type <> 'doc' OR doc_kind IS NOT NULL`.
- `verifiedAt` already exists (`@db.Date`). Promote to `checked_at timestamptz` semantics: either
  change the column type or add `checked_at` — **builder's call**, as long as the TTL compares a
  timestamp, not a date.
- No change to `LearningStep` beyond what's needed to read `type`/`docKind` through to the page
  (it already joins `Course`).

### 3. Liveness

- Videos: `GET https://www.youtube.com/oembed?url=<video url>&format=json`.
  `200` → live (also refresh `title` / `author` from `title` / `author_name` **only if** the curated
  value is empty — curated text wins). `401/403` (embedding disabled) → live-but-flagged.
  `404` / `400` → dead.
- Everything else: existing `checkLiveness` (`live | dead | blocked`).
- Dead → `status = dead`, excluded from bundles (existing OUT-7 path). Blocked → kept, reported.

### 4. Weekly refresh (the "cache with a one-week TTL")

- New route `app/api/cron/catalog/route.ts`, Bearer `CRON_SECRET` (same pattern as reminders),
  called **weekly** by Supabase pg_cron (`pnpm db:schedule` extended).
- Picks rows with `checked_at < now() - 7 days`, re-checks them in small batches inside the
  function budget, writes `checked_at`, `status`. If any row changed status, rebuilds the affected
  skill bundles (same code as `pnpm bundles:rebuild`, scoped to those skills).
- Logs counts only (N7).
- **N23 amended** to: "`/api/cron/reminders` and `/api/cron/catalog` are the only scheduled paths."
  `pnpm check:links` stays as the manual full sweep.

### 5. Selection and bundles

- `MAX_RESOURCES_PER_GAP` (today 3) becomes a **per-lane** ceiling of 3, clamped by the member's
  `capCourses` quota, which now counts **per lane** (member decision): Free 1 Watch + 1 Read, mid
  plan 2 + 2, top plan 3 + 3. `QUOTAS` / `NOTES` / pricing copy change from "course matches per
  gap" to "videos and docs per gap"; admin bounds 0–3 per lane (CHECK updated, existing values
  halved-and-rounded-up in the migration — builder confirms against live `plan_configs`).
- A lane shortened **only by the quota** says "More on <next plan>", never "No vetted videos".
  Lane membership: `video` (and `course` that is a video course) → Watch; `doc`, `roadmap`,
  `repo` → Read. *Builder's call* where an existing `course` row lands; default Watch if its
  provider is a video platform, else Read.
- Bundles must keep enough of each type for selection to fill both lanes: bundle top-N per skill
  goes from 5 to **at least 3 per lane**.
- **Lanes are alternatives** (member decision). Per gap, the plan picks **one** primary step —
  the top Watch item if the gap has one, else the top Read item — and only those go into the
  time-budget knapsack, the study plan (F30) and the roadmap compiler. The roadmap item is per gap
  ("Learn Kubernetes"), ticked once whichever lane the member used. Every other row in both lanes is
  shown as an alternative ("or read this instead"), carries no budget cost and no roadmap item.
  `LearningStep` gains a `lane` (`watch | read`) and an `isPrimary` boolean; builder adds the CHECK
  that a gap has at most one primary.
- Out-of-budget primaries show greyed "Outside your budget", as today.
- The one model call (S6) is unchanged; it still writes notes over ids it was given, never URLs.

### 6. UI (`app/(app)/analysis/[id]/learning/page.tsx`)

- Replace the single `<ol>` of steps with a two-column grid: **Watch** lane (pink `Play` circle
  heading) and **Read** lane (marigold `BookOpen` circle heading). Stacks on narrow screens,
  Watch first.
- Each row keeps today's anatomy (author, title, entry label, note, price, length, Open ↗) but
  swaps the two-letter `mark` circle for the lane icon; docs show `Official` / `Tutorial` tag.
- Empty lane → one muted line, never hidden. A gap with no material at all keeps `FallbackNote`.
- Mockup reference: `.superpowers/brainstorm/…/learning-layout.html`, option B.

### 7. Docs

- specs.md F8 updated (lanes, per-lane cap, weekly refresh). CLAUDE.md N23 amended.
  `lib/catalog/courses.ts` header updated ("quarterly" → weekly).

## Settled by Claude (review these)

- **TTL is best effort, not a request-path filter.** A row past 7 days is still served unless it is
  `dead`; Goal 5 means "the job re-checks anything past 7 days", not "nothing older is ever shown".
  Reason: one missed cron run must not empty every Learning tab. Rows unchecked for 30+ days are
  reported in the job's log counts.
- **Blocked links follow the existing seed rule.** `blocked` (401/403/429/timeout) is kept and
  reported for a human to open once — same as today. oEmbed 401/403 (embedding disabled) counts as
  `live`; no new "flagged" column.
- **Daily cron, weekly TTL.** The job runs **daily** and checks only rows whose `checked_at` is past
  7 days, in batches that fit the 300s budget. The seed staggers initial `checked_at` across 7 days
  so ~400 rows don't all come due at once. N23 amendment names the job as daily.
- **Coverage unit is per skill.** The seed fails if a skill has no video or no doc. Each curated
  entry carries a `level` so bundles can fill; the bundle builder's two-per-author limit applies
  **per lane**, so freeCodeCamp/Fireship can't starve a lane but also aren't capped across both.
- **Watch ordering is authored.** New field `role: "primary" | "overview"` on video entries.
  `primary` (full / crash course) outranks `overview` regardless of `rankOf`. If the primary doesn't
  fit the budget it still shows, greyed "Outside your budget", and the overview leads the in-budget
  list.
- Legacy rows: `type`/`docKind` backfilled on the ~90 existing entries before the CHECK lands.

## Left to the builder

- Exact column change for the timestamp TTL.
- Batch size per cron invocation vs 300s budget.
- Whether bundle rebuild runs inline in the cron or as a follow-up call.
- Placement of legacy `course` rows into lanes (default above).

## Later (explicitly out of scope now)

- Option A: YouTube Data API key → rank within allowlisted channels by views/recency, open search
  with a higher bar. Would slot into the same weekly job.

## Verification (light, per §11)

- `pnpm seed:catalog` passes with zero dead links across all ~100 skills; report lists coverage per
  skill × lane, and any skill missing a lane fails the seed.
- Hit the cron route locally with the secret; confirm only >7-day rows were checked.
- Open a Learning tab for a real analysis: both lanes render, icons correct, empty-lane copy, phone
  width stacks, budget greying still works.

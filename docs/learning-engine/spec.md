# spec.md — Roleform Learning Engine (RLE)

> Subsystem of Roleform. Consumes a Job Description + a stored resume profile, and returns a
> ranked, evidence-anchored, time-budgeted learning plan drawn from an internal resource corpus.

---

## 0. The spine

**Every expensive operation happens once at ingest time, never at query time. The roadmap.sh
skill taxonomy is the join key that makes that possible.**

Read this sentence before making any design decision in this repo. If a proposed change moves
work from ingest-time to request-time, it must be justified explicitly, because request-time work
is billed to the user on every single run while ingest-time work is amortised across all users
forever.

Two corollaries that fall out of the spine:

- Extraction never produces free text. It produces **canonical `skill_id`s**. Free text cannot be
  cached, diffed, joined, or precomputed. IDs can do all four for zero tokens.
- Gap analysis is a **set operation on IDs**, not an LLM judgement. Set difference costs nothing.

---

## 1. What the user actually gets (the real goal)

The literal request is "recommend learning material for the gaps." The real goal is:

> Let the candidate walk into *this specific interview* able to truthfully claim something they
> could not claim yesterday.

That reframes the output. A list of courses does not serve it. The **proof-of-learning loop** does:

Every recommended resource is bound to three things:

1. **The gap it closes** — a canonical skill node the JD requires and the resume does not evidence.
2. **The resume bullet it unlocks** — the exact bullet in the user's profile that becomes truthfully
   rewritable once the resource is consumed. This preserves Roleform's stated product principle,
   *"Nothing is invented — bullets are reordered, reworded and re-weighted."* The engine never
   fabricates the bullet; it stages a bullet that becomes legitimate **after** the learning happens.
3. **The interview question it answers** — pulled from the existing interview-question pillar.

A resource that cannot be bound to all three is not shown. This is the precision bar, and it is
also a cost control: it caps output length and kills the "here are 20 courses, good luck" failure
mode that inflates synthesis tokens.

### Output contract (what the UI renders)

```
match_score          existing dial: Strong match / Partial evidence / Not evidenced
gaps[]               ranked, max 7 (hard cap — see §8)
  ├─ skill           canonical node (name, roadmap.sh slug, level)
  ├─ severity        0–100
  ├─ why_it_matters  one line, grounded in a quoted JD span
  ├─ current_evidence  what the resume DOES show near this skill (or null)
  ├─ unlocks_bullet  the resume bullet that becomes claimable
  ├─ answers_question  interview question id
  └─ resources[]     max 3, each with precise entry point (§9)
plan                 time-budgeted sequence (§10)
meta                 tokens_charged, cache_hits, model_mix, corpus_version
```

---

## 2. Pipeline

Deterministic workflow with two LLM stages. **Not an autonomous agent loop** — an agent that
decides its own steps also decides its own token spend, which is unacceptable when the user is
billed per run. See `agent.md` §2 for the reasoning and the one narrow exception.

```
S0  INTAKE        normalise, hash, dedupe                         0 tokens
S1  SEGMENT       strip JD boilerplate, classify sections         0 tokens
S2  EXTRACT       JD → typed requirements  (LLM, small model)     ~1 call, cache-keyed
S2b EXTRACT       Resume → evidence claims (LLM, small model)     ~1 call, cached per resume hash
S3  RESOLVE       free text → canonical skill_id                  0 tokens (embeddings + alias table)
S4  SCORE         JD importance × resume evidence → gap severity  0 tokens (deterministic)
S5  RETRIEVE      skill_id → resources                            0 tokens (precomputed bundles)
S6  SYNTHESISE    plan narrative + bullet staging (LLM, big)      exactly 1 call
S7  VALIDATE      guardrails, schema, link resolution             0 tokens
```

Nine logical steps, **two billable LLM stages on a warm cache, three on a cold one.**

### Stage contracts

| Stage | Input | Output | Failure mode | Recovery |
|---|---|---|---|---|
| S0 | raw JD text, user_id | `jd_hash`, `resume_hash`, normalised text | non-JD paste | reject at guardrail IN-3 |
| S1 | normalised JD | `sections[]` with weights | unknown layout | fall through to `body` weight 1.0 |
| S2 | JD sections (weighted only) | `requirements[]` typed | schema violation | 1 retry w/ repair prompt, then hard fail |
| S2b | resume text | `claims[]` with evidence spans | — | cached; recompute only on resume change |
| S3 | free-text terms | `skill_id[]` + confidence | no match ≥ threshold | park as `unresolved`, exclude from gaps |
| S4 | requirements + claims | `gaps[]` ranked | — | pure function, unit-testable |
| S5 | `skill_id` + level | `resources[]` | empty bundle | roadmap.sh node fallback (§11) |
| S6 | gaps + resource metadata **only** | plan JSON | hallucinated resource | OUT-1 rejects, 1 repair retry |
| S7 | plan JSON | validated payload | validation fail | serve degraded (resources w/o narrative) |

**S6 never receives chunk text.** It receives resource *metadata* (title, author, duration,
timestamp, one-line pre-computed summary). This is the single largest token saving in the system —
sending retrieved chunk bodies to the synthesiser is what makes naive RAG expensive, and here it
buys nothing, because the synthesiser's job is sequencing and framing, not summarising.

---

## 3. Data model (Supabase / Postgres + pgvector)

```sql
-- ── Taxonomy: the join key ────────────────────────────────────────────
skills (
  id            uuid pk,
  slug          text unique,          -- 'react-hooks'
  name          text,
  roadmap_id    text,                 -- roadmap.sh node id
  roadmap_path  text,                 -- 'frontend/react/hooks'
  parent_id     uuid null references skills(id),
  depth         int,
  embedding     vector(1024),
  hypo_doc      text,                 -- amortised HyDE, see rag-strategy.md §6
  hypo_embedding vector(1024)
)

skill_aliases (                       -- 'RTL', 'React Testing Library', 'react-testing-lib'
  skill_id uuid, alias text, source text, confidence real,
  primary key (skill_id, alias)
)

-- ── Corpus ────────────────────────────────────────────────────────────
resources (
  id uuid pk, type text,              -- youtube | pdf | repo | doc
  url text unique, title text, author text, channel_id text,
  published_at date, duration_sec int, language text,
  license text, is_free bool,
  quality_score real,                 -- computed at ingest, see rag-strategy.md §3
  status text,                        -- active | stale | dead | quarantined
  last_verified_at timestamptz,
  corpus_version int
)

resource_chunks (
  id uuid pk, resource_id uuid,
  content text, context_prefix text,  -- contextual retrieval
  start_ts int null, end_ts int null, -- video/audio
  page_no int null, heading_path text null,
  embedding vector(1024),
  tsv tsvector generated always as (to_tsvector('english', content)) stored
)

resource_skills (                     -- the join. built at ingest.
  resource_id uuid, skill_id uuid,
  level text,                         -- intro | working | deep
  confidence real, is_primary bool,
  best_chunk_id uuid,                 -- precise entry point
  primary key (resource_id, skill_id)
)

-- ── Precomputed answer cache: the reason S5 costs nothing ─────────────
skill_bundles (
  skill_id uuid, level text,
  ranked_resource_ids uuid[],         -- top 5, diversity-enforced
  entry_points jsonb,                 -- {resource_id: {chunk_id, ts, why}}
  refreshed_at timestamptz,
  primary key (skill_id, level)
)

-- ── Per-user state ────────────────────────────────────────────────────
resume_versions (user_id, resume_hash pk, text, extraction jsonb, created_at)
jd_cache        (jd_hash pk, normalised text, sections jsonb, extraction jsonb,
                 model text, hit_count int)
runs            (id, user_id, jd_hash, resume_hash, output jsonb,
                 tokens_in, tokens_out, cache_hits, cost_micros, model_mix, created_at)
usage_ledger    (user_id, run_id, units_charged, balance_after, created_at)
```

**Indexes that matter:** HNSW on `resource_chunks.embedding` and `skills.embedding`; GIN on
`resource_chunks.tsv`; btree on `resource_skills(skill_id, level, confidence desc)`;
`skill_bundles` is the hot path and should stay small enough to sit in cache.

> **Vector store decision:** use `pgvector` inside the existing Supabase instance rather than a
> separate Qdrant deployment. Rationale: corpus is bounded (taxonomy-scoped, likely <500k chunks),
> and the retrieval path needs to join vectors against `resource_skills` + `resources` metadata in
> the same query. Cross-store joins would force an application-side merge and a second round trip.
> Revisit if chunk count crosses ~2M. This differs from Locus deliberately — Locus has unbounded
> user-supplied sources; RLE has a curated corpus.

---

## 4. Skill resolution (S3)

The extractor emits free-text terms. Resolution to `skill_id` runs in four tiers, stopping at the
first hit — **no LLM in any tier**:

1. **Exact alias match** (normalised: lowercase, strip punctuation, singularise). Covers ~70%.
2. **Trigram fuzzy** on `skills.name` + `skill_aliases.alias`, threshold 0.85. Covers typos.
3. **Embedding nearest-neighbour** against `skills.embedding`, cosine ≥ 0.82.
4. **Miss** → write to `unresolved_terms` with the JD span. Excluded from gap analysis. A weekly
   job reviews high-frequency unresolved terms and promotes them to aliases or new nodes.

Tier 4 is the corpus's growth mechanism: the taxonomy learns from real JDs instead of a curator
guessing. Track `resolution_rate` as a first-class metric; if it drops below 0.90, the taxonomy is
drifting behind the market.

**On roadmap.sh as the source:** ingest the roadmap JSON exports directly into `skills` rather than
depending on a live MCP server at request time. Request-time dependency on a third party adds
latency, a failure mode, and a rate limit to every run for data that changes monthly at most. Sync
nightly.

---

## 5. JD importance scoring (S4a) — deterministic

`importance = w_section × w_modality × w_repetition × w_position × w_depth`, clamped 0–1.

| Factor | Values | Rationale |
|---|---|---|
| `w_section` | title 1.0 · requirements 0.9 · responsibilities 0.7 · nice-to-have 0.4 · tech-stack-blurb 0.6 · benefits/EEO 0.0 | Section placement is the strongest free signal in a JD |
| `w_modality` | "must/required/essential" 1.0 · "strong experience" 0.85 · plain mention 0.7 · "familiarity/exposure" 0.5 · "bonus/plus" 0.35 | Extracted as a typed field in S2 — free, rides along the same call |
| `w_repetition` | `1 + 0.1×ln(count)`, cap 1.3 | Repeated skills are load-bearing |
| `w_position` | `1.0 → 0.85` linear over the requirements list | Recruiters front-load |
| `w_depth` | leaf 1.0 · mid 0.9 · root 0.75 | "React hooks" is more actionable than "frontend" |

Years-of-experience qualifiers ("5+ years Kubernetes") set `required_level = deep` rather than
inflating importance — they change *what* to learn, not *whether*.

---

## 6. Evidence scoring (S4b) — deterministic

For each JD requirement, find the strongest resume claim on the same or descendant `skill_id`:

| Bucket | Condition | `evidence` |
|---|---|---|
| Strong match | direct claim + quantified outcome or ≥12 months duration | 1.0 |
| Strong match | direct claim, named project | 0.85 |
| Partial evidence | descendant/sibling node claimed, or listed in a skills blob with no project | 0.5 |
| Partial evidence | parent node claimed (e.g. JD wants `react-hooks`, resume shows `react`) | 0.4 |
| Not evidenced | no claim within 2 taxonomy hops | 0.0 |

`severity = importance × (1 − evidence) × 100`

Sort desc, take top 7. **The cap is a cost control, not a UX preference** — it bounds S6's input
size and therefore the per-run bill. It is also better product: seven gaps is a plan, twenty is a
demoralising audit.

Ties break toward the shallower taxonomy node (learn the foundation first).

---

## 7. Resource selection (S5) — zero-token retrieval

Request-time is a lookup, not a search:

```sql
select entry_points, ranked_resource_ids
from skill_bundles
where skill_id = $1 and level = $2;
```

Bundles are built by a nightly job (`rag-strategy.md` §7). The expensive part — hybrid search,
reranking, diversity enforcement — runs there, once per `(skill, level)` pair, and is read by every
user forever.

**Personalisation without recomputation.** Bundles are generic; the user is not. Apply cheap
deterministic filters over the precomputed top-5 to pick the final ≤3:

- **Format fit** — big gap (severity >70) → structured course/playlist; small gap → single video
  segment or doc section.
- **Stack fit** — if the resume evidences TypeScript, prefer the TS variant of a resource. Stored as
  a `resource.tags` filter, not a re-ranking pass.
- **Duration fit** — respects the user's stated time budget (§10).
- **Recency floor** — for fast-moving skills (`skills.volatility = high`), drop resources older than
  18 months regardless of quality score.

If fewer than 3 survive filtering, return fewer. Padding with a weak resource costs credibility and
tokens.

---

## 8. Precision rules — the entry point

The differentiator is **where** you land, not **what** you're sent.

- **YouTube** → deep link at `best_chunk.start_ts`, plus the chapter title and a duration for that
  segment only. "Watch minutes 14:20–26:05 of this" beats "watch this 8-hour course."
- **PDF/docs** → page number + heading path.
- **Repos** → specific file/directory + the commit SHA it was verified at, and a one-line "read this
  to see X implemented" rather than "explore this repo."

Entry points are computed at bundle-build time and stored. Never derived at request time.

---

## 9. Fallback when the corpus has nothing (confirmed decision)

**Emit the roadmap.sh node link only. No live web or YouTube search.**

```json
{
  "skill": "event-driven-architecture",
  "resources": [],
  "fallback": {
    "type": "roadmap_node",
    "url": "https://roadmap.sh/backend#event-driven-architecture",
    "label": "Curated resources for this topic are being added — start with the roadmap"
  }
}
```

Consequences, accepted deliberately:

- Cost stays bounded and predictable; a run's ceiling is knowable before it starts.
- Zero risk of surfacing an unvetted or dead link, which protects the guardrail in `guardrails.md`
  OUT-1 (no resource may exist outside the DB).
- Every fallback is logged to `corpus_gaps(skill_id, level, count)`. That table **is the ingestion
  backlog** — it tells you exactly what to index next, ranked by real demand. The fallback path is a
  product feature, not a degradation.

Coverage target: fallback rate <10% of gaps by end of Phase 4.

---

## 10. Time-budgeted plan (S6 input prep) — deterministic

User supplies a budget ("6 hours before Thursday"). Solve a bounded knapsack over selected
resources: maximise `Σ severity_weight`, subject to `Σ duration ≤ budget`, with a dependency
constraint that a prerequisite node is scheduled before its descendant.

Runs in application code in single-digit milliseconds. The LLM is told the *result* and asked to
narrate it — it is never asked to do the scheduling, because an LLM doing arithmetic on durations is
both more expensive and less correct.

---

## 11. Token economics

Assumptions: small model = Haiku-class for extraction, large = Sonnet-class for synthesis; prompt
caching enabled on static prefixes.

| Path | LLM calls | Est. billable tokens | Notes |
|---|---|---|---|
| **Naive design** (chunk text → LLM rank → LLM synthesise) | 4–6, all large model | 35k–60k | retrieved chunk bodies dominate |
| **Cold run** (new JD, new resume) | 3 (2 small, 1 large) | ~5.5k | full extraction both sides |
| **Warm run** (new JD, known resume) | 2 (1 small, 1 large) | ~3.6k | the common case |
| **Hot run** (JD seen before — same posting) | 1 (large only) | ~2.2k | popular JDs hit this |

**~85–92% reduction vs. naive**, model-mix dependent. These are design-time estimates; the eval
harness in `planning.md` Phase 5 must confirm them against real JDs before they appear in pricing
copy.

Where the savings come from, in order of size:

1. Chunk text never reaches the synthesiser (biggest single win).
2. Retrieval and ranking are precomputed → 0 tokens at request time.
3. Resume extraction cached per `resume_hash` → free on every run after the first.
4. JD boilerplate stripping (EEO, benefits, company blurb) → 40–60% off S2's input.
5. Prompt caching on the static instruction + taxonomy-slice prefix → ~90% off that portion.
6. Small model for extraction; large model only for the one call where prose quality is visible.

### Metering

Every run writes `runs.tokens_in/out` and `usage_ledger.units_charged`. **Open decision for you:**
whether a cache hit is passed to the user as a discount or retained as margin. Recommendation —
charge a flat per-run credit rather than raw tokens. Users cannot predict token counts, flat pricing
makes cache hits pure margin, and it removes the perverse incentive to paste shorter JDs.

---

## 12. API surface

```
POST /api/analyse           { jd_text, resume_id, time_budget_hours? } → { run_id }
GET  /api/runs/:id          → status + payload (poll or SSE)
POST /api/resume            { file | text } → { resume_id, resume_hash }
GET  /api/skills/search     ?q=  → taxonomy autocomplete (0 tokens)
POST /internal/ingest       admin — enqueue resource
POST /internal/bundles/rebuild  admin — rebuild skill_bundles
```

S0–S5 typically complete in <2s; S6 is the latency. Run the pipeline as a queued job with SSE
progress ("Reading the JD → Comparing to your profile → Finding material"), matching the existing
3-step UI. Vercel function timeouts make a synchronous 30s request fragile.

---

## 13. Non-goals

- No live web search at request time. Corpus-only, roadmap.sh fallback.
- No paid-course affiliate integration in v1.
- No autonomous agent loop (see `agent.md` §2).
- No resume rewriting inside RLE — it stages the bullet; the existing resume pillar writes it.
- No multi-language corpus in v1 (English only; detect and reject others at IN-4).
- No progress tracking / "mark as complete" in v1. Design the schema so it can be added
  (`user_skill_progress`) without a migration of the core tables.

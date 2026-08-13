# rag-strategy.md — Roleform Learning Engine

How resources get in, and how they get out for zero request-time tokens.

---

## 1 · The inversion

Standard RAG: user asks → embed the query → search → rerank → stuff passages into the prompt →
generate. Every step is paid per request, and the passage-stuffing step dominates the bill.

RLE inverts it. Because the query space is **closed** — every possible query is a `(skill_id, level)`
pair from a finite taxonomy — the answers can be computed in advance.

```
STANDARD                      RLE
─────────────────────         ─────────────────────────────────────
query → embed                 (ingest) chunk → tag with skill_id
      → search                (nightly) per skill: search, rerank, diversify
      → rerank                         → freeze as skill_bundles
      → stuff passages        (request) SELECT * FROM skill_bundles WHERE skill_id = ?
      → generate                       → deterministic filters → 1 synthesis call

per-request LLM: 4-6          per-request LLM: 1
per-request search: yes       per-request search: no
```

This works *only* because the taxonomy is closed. It is the entire reason `spec.md` §4 insists on
canonical IDs. Open-vocabulary skill extraction would force the standard path and roughly triple the
per-run cost.

---

## 2 · Ingestion pipeline

```
fetch → extract → dedupe → chunk → contextualise → embed → tag → score → index
```

BullMQ, one job per resource, idempotent by URL. Failures go to `quarantined` with a reason, never
silently dropped — silent drops make corpus coverage unknowable.

**Dedupe** on content hash *before* chunking. Reuploaded videos and mirrored PDFs are common and
each duplicate doubles that resource's weight in every bundle it lands in.

---

## 3 · Chunking, per source type

Uniform chunking is the most common RAG mistake. Each type has a different natural unit.

**YouTube** — the highest-value type, because timestamps enable the precision play.
- Transcript via captions; ASR fallback (Whisper) when absent, flagged `transcript_quality='asr'`.
- Merge caption cues into **topic windows of 60–180s**, split at chapter markers where available,
  otherwise at semantic shift (embedding distance between adjacent 30s windows > threshold).
- Never split mid-explanation — a chunk that starts halfway through a concept is unusable as an
  entry point, which is the whole point of indexing video.
- Store `start_ts`/`end_ts`. These become the deep link.

**PDFs / docs**
- Layout-aware extraction; drop headers, footers, page numbers.
- Chunk on heading boundaries, target 400–800 tokens, 15% overlap.
- Store `page_no` + `heading_path`.

**Repos**
- Index README, `/docs`, and top-level guides. **Do not index source code.** Code chunks retrieve
  terribly against conceptual queries and inflate the corpus with near-duplicates.
- One chunk per heading section. Store `file_path` + `commit_sha` so the entry point survives a
  refactor of `main`.
- `quality_score` inputs: stars, last-commit recency, whether docs exist at all.

---

## 4 · Contextual retrieval

Chunks lose their context when isolated. Before embedding, prepend a generated context line:

```
context_prefix: "From 'Next.js App Router Deep Dive' (Jack Herrington, 2025),
                 section on data fetching patterns."
content:        "...the reason this doesn't hydrate on the client is..."
```

Embed `context_prefix + content`; store them separately so display can use `content` alone. This is
Anthropic's contextual retrieval technique and it reliably cuts retrieval failures — the isolated
chunk above is near-meaningless to an embedding model, the contextualised one is not.

Generate the prefix **deterministically from metadata** (title, author, year, heading path) rather
than with an LLM call per chunk. The LLM version is marginally better and costs a call per chunk
across the whole corpus; at RLE's corpus size the metadata template captures most of the benefit.

---

## 5 · Hybrid search (bundle-build time only)

Dense-only retrieval misses exact technical tokens — version numbers, API names, acronyms. Sparse
misses paraphrase. Use both, fuse with Reciprocal Rank Fusion:

```sql
-- dense
select id, 1.0/(60 + rank() over (order by embedding <=> $q)) as rrf
from resource_chunks order by embedding <=> $q limit 100

-- sparse
select id, 1.0/(60 + rank() over (order by ts_rank(tsv, $tsq) desc)) as rrf
from resource_chunks where tsv @@ $tsq limit 100

-- fuse: sum rrf, order desc
```

RRF needs no score normalisation between the two systems, which is why it beats weighted-sum
fusion in practice. `k=60` is the standard constant; leave it alone unless the eval says otherwise.

---

## 6 · Amortised HyDE

HyDE (Hypothetical Document Embeddings) improves retrieval by generating an ideal answer and
embedding *that* instead of the query. Standard HyDE costs one LLM call per query — unaffordable
at request time.

RLE generates the hypothetical document **once per taxonomy node**, at taxonomy build time, and
stores it in `skills.hypo_doc` / `hypo_embedding`:

> *"A lesson on React Server Components explains the server/client boundary, when components render
> on the server, how the RSC payload streams to the client, why client bundles shrink, and the
> constraints on hooks and event handlers in server components."*

~1,500 taxonomy nodes × 1 small-model call = a one-time cost of a few dollars, then free forever.
Bundle building searches with `hypo_embedding`, not with the bare skill name.

Same trick, same principle as the spine: pay once at build time, read forever.

---

## 7 · Bundle builder (nightly)

For each `(skill_id, level)`:

1. Hybrid search using `hypo_embedding` + skill name + aliases, filtered to `teaches=true` chunks.
2. **Rerank** the top 50 with a cross-encoder (`bge-reranker-v2` self-hosted, or Cohere Rerank).
   A cross-encoder, not an LLM — 10–50× cheaper, purpose-built, and this runs across the whole
   taxonomy nightly.
3. **Roll up** chunk scores to resources: `resource_score = 0.6 × best_chunk + 0.25 × quality_score
   + 0.15 × coverage` (coverage = how many distinct sub-aspects of the skill the resource hits).
4. **Diversity (MMR)** — max 2 per author/channel, and prefer format variety (one video, one doc,
   one repo) so a bundle serves different learning preferences without personalising.
5. **Freeze** top 5 + entry points into `skill_bundles`.

Rebuild triggers: new resources tagged for that skill, quality score changes, a resource going
dead, or a weekly full sweep. Never rebuild on a user request.

---

## 8 · Request-time retrieval

```
lookup bundle(skill_id, level)      →  ~5ms, no tokens
apply deterministic filters (§7 of spec.md)
take ≤3
```

That is the entire request-time retrieval path. If a future change adds an embedding call, a search,
or a rerank here, it violates invariant I1 and needs written justification.

---

## 9 · Techniques deliberately rejected

Each of these is standard advice, and each is wrong for this system. Reasons recorded so they don't
get re-proposed in six months.

| Technique | Why not |
|---|---|
| **Request-time HyDE** | One call per gap × 7 gaps = 7 calls. Amortised version (§6) captures the benefit for free. |
| **Step-back prompting** | Solves query abstraction. The taxonomy already provides abstraction via `parent_id` — walk the tree instead. Zero tokens. |
| **LLM reranking** | A cross-encoder is 10–50× cheaper at equivalent quality for this task. Reserve LLM judgement for where nothing else works. |
| **Query expansion at request time** | Alias table does it for free, deterministically, and is auditable. |
| **Multi-hop / iterative retrieval** | Unbounded token spend, non-reproducible, and the query is a single skill node — there is nothing to hop to. |
| **Passing chunks to the synthesiser** | Invariant I2. The precomputed `summary` field carries the meaning at 1/50th the tokens. |
| **GraphRAG** | The taxonomy already *is* the graph, and it is curated rather than extracted. Building a second one is duplicated structure. |
| **Semantic caching of full responses** | Two JDs that embed similarly can have materially different requirements. Hash-exact caching only. |

---

## 10 · Evaluation

Two evals, because retrieval and gap analysis fail independently.

**Retrieval eval** — 30 `(skill, level)` pairs, hand-ranked ideal top-3. Metric: **nDCG@3**, target
≥0.75. Run after every bundle-builder change.

**Gap eval** — 50 JD/resume pairs with hand-labelled expected gaps. Metrics:
- gap **recall** ≥0.85 — missing a real gap is the worse error; the user prepares for the wrong
  interview.
- gap **precision** ≥0.75 — a false gap wastes their study time.
- **resolution rate** ≥0.90 — below this, the taxonomy is drifting behind the market.

**Cost eval** — same golden set, actual tokens vs. `spec.md` §11 estimates. Any figure off by >25%
gets corrected in the spec before it informs pricing.

Run all three in CI on any change to a prompt, the resolver, the scorer, or the bundle builder.
These four components own every number the user sees.

---

## 11 · Corpus health metrics

Dashboard these from day one of Phase 6 — they are the leading indicators of the product quietly
degrading:

| Metric | Target | Meaning if it slips |
|---|---|---|
| Bundle coverage | ≥80% of JD-observed nodes | Users hit fallbacks |
| Fallback rate | <10% of gaps | Corpus behind demand |
| Resolution rate | ≥0.90 | Taxonomy behind the market |
| Dead link rate | <2% | Verifier sweep not running |
| Median chunk age (high-volatility skills) | <12 months | Recommending stale material |
| Cache hit rate (JD + resume) | >40% after 1k runs | Dedupe or hashing is broken |

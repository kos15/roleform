# planning.md — Roleform Learning Engine

Build order is **risk-first, then vertical slice**. The riskiest assumptions are resolved before any
polish, because discovering them at 90% completion is the most expensive mistake available.

Testing follows the stated project preference: **no rigorous test suite during a phase — verify at
the phase boundary only.** Each phase below has a single explicit done-state; that is the test.

---

## The three assumptions that can kill this design

Resolve these before building anything else. Each has a cheap experiment.

| # | Assumption | If false | Experiment (≤1 day) |
|---|---|---|---|
| **R1** | roadmap.sh nodes are granular enough to be the join key for real JDs | Whole design collapses — no join key, no precomputation, no cheap gaps | Take 30 real JDs from your target roles. Hand-resolve every skill term to a roadmap node. Measure resolution rate. **Need ≥85%.** |
| **R2** | Skill-tagging chunks at ingest is affordable and accurate | Corpus can't be built; retrieval falls back to expensive request-time search | Tag 200 chunks with the S2-ingest prompt. Measure cost/1k chunks + precision against hand labels. **Need ≥0.8 precision @ <$0.01/chunk.** |
| **R3** | Precomputed bundles beat request-time search on quality | Have to reintroduce per-request retrieval and eat the tokens | Build bundles for 20 skills. Blind A/B against live hybrid search on the same skills. **Need bundles ≥ parity.** |

**Do not start Phase 1 until R1 passes.** If R1 lands between 70–85%, the fix is a Roleform-owned
overlay taxonomy that extends roadmap.sh with the missing nodes — plan two extra days, don't abandon
the approach. If R1 lands below 70%, stop and redesign: the taxonomy would need to be
market-derived (clustered from JDs) rather than curated, which is a different project.

---

## Phase 0 — De-risk (2–3 days)

Run R1, R2, R3. Output is a one-page findings note and a go/no-go on the join-key design.

**Done-state:** the resolution rate from R1 is written down as a number, and the decision to proceed
(or to build the overlay taxonomy) is recorded in `decisions.md`.

---

## Phase 1 — Taxonomy spine (3–4 days)

The stable core. Everything else attaches to it.

- Ingest roadmap.sh JSON exports → `skills` (id, slug, roadmap_path, parent_id, depth).
- Build `skill_aliases` from: roadmap node titles, a seeded alias list, and the 30 hand-resolved JDs
  from R1.
- Embed `skills.name + roadmap_path` → `skills.embedding`.
- Implement the 4-tier resolver (§4 of spec) as a pure function with no network calls.
- Nightly sync job for roadmap updates.

**Done-state:** `resolve("RTL")`, `resolve("k8s")`, `resolve("react hooks")`, and 30 more terms from
real JDs each return the correct `skill_id`, and the resolver reports `resolution_rate` ≥ 0.85 over
the R1 JD set.

---

## Phase 2 — Walking skeleton (4–5 days)

One thin, ugly, end-to-end path. **Ship this before deepening anything.** It surfaces integration
problems while they are still cheap and gives every later decision something real to test against.

Scope it brutally: **one JD, one resume, one skill, one hardcoded resource, no UI polish.**

- S0 intake + hashing
- S1 section segmenter (regex/heuristic — no LLM)
- S2/S2b extractors with structured output
- S3 resolver (from Phase 1)
- S4 scorer (pure function)
- S5 stubbed — returns a hardcoded resource
- S6 synthesiser, single call
- S7 schema validation only

**Done-state:** you paste a real JD, and the API returns a valid payload naming at least one correct
gap with a coherent narrative — end to end, through the queue, rendered in the existing 3-step UI.
Log the token count. That number is your baseline for every optimisation that follows.

---

## Phase 3 — Corpus build (7–10 days) ← the long pole

This replaces the existing ad-hoc resource collection. Treat the current resources as **seed input,
not as a schema to preserve.**

### 3a. Migration of what exists (1 day)

- Export current resources to a flat CSV: `url, type, title, any_existing_tags`.
- Re-ingest them through the new pipeline from scratch. Do not attempt to map old tags to
  `skill_id` by hand — the new tagger does it better and cheaper than the migration would.
- Keep the old store read-only for one release as a rollback path, then drop it.
- Any resource that fails ingest (dead link, no transcript, unparseable) goes to `quarantined` with
  a reason. Review that list once; do not let it block the phase.

### 3b. Ingestion pipeline (4–5 days)

Per `rag-strategy.md` §2–§4. Order: repos → PDFs/docs → YouTube. **Repos first** because they have
the simplest extraction (README + docs dir, no transcript dependency, no OCR), so the pipeline shape
gets proven on the easy case.

Queue with BullMQ (already familiar from Locus). Idempotent by `url` — re-running ingest on the same
URL must not duplicate chunks.

### 3c. Skill tagging + quality scoring (2 days)

Batch, off-peak, small model. This is the expensive step, paid once.

### 3d. Bundle builder (2 days)

The nightly job that turns tagged chunks into `skill_bundles` with entry points and diversity
enforcement.

**Done-state:** ≥300 resources active, ≥80% of the taxonomy nodes that appeared in the R1 JD set
have a non-empty bundle at `working` level, and `skill_bundles` lookups return in <50ms p95.

---

## Phase 4 — Wire the real retrieval + close the loop (4–5 days)

- Replace the S5 stub with real bundle lookups + the deterministic personalisation filters.
- Implement the knapsack time-budget planner.
- Implement the **proof-of-learning loop** — bind each resource to `unlocks_bullet` and
  `answers_question`. This requires S2b to emit bullet-level spans, not just skill claims.
- Implement the roadmap.sh fallback + `corpus_gaps` logging.

**Done-state:** for 10 real JDs, every returned resource has a precise entry point, a bound resume
bullet, and a bound interview question — or is a clean roadmap fallback. Fallback rate is recorded.

---

## Phase 5 — Guardrails, eval, and cost verification (4–5 days)

Now, and only now, is the structure stable enough that testing is not wasted effort.

- Implement `guardrails.md` in full: IN-1…IN-6, OUT-1…OUT-7, COST-1…COST-4.
- **Golden set:** 50 JD/resume pairs with hand-labelled expected gaps. Track gap precision/recall.
- **Retrieval eval:** for 30 `(skill, level)` pairs, hand-rank the ideal top-3; measure nDCG@3
  against bundles.
- **Cost eval:** run the golden set, compare actual tokens against the spec §11 estimates. Any
  estimate off by >25% gets corrected in the spec before it reaches pricing copy.
- **Injection suite:** 20 adversarial JDs containing instruction-injection payloads.

**Done-state:** gap recall ≥0.85 on the golden set, zero OUT-1 violations across the full suite, and
measured per-run cost within 25% of the §11 estimate.

---

## Phase 6 — Metering, quota, and admin (3 days)

- `usage_ledger` writes on every run; balance enforcement pre-flight.
- Per-user quota + admin panel to adjust it (same pattern as Locus).
- Cost dashboard: tokens/run, cache-hit rate, fallback rate, resolution rate, p95 latency.
- Pre-run cost estimate shown to the user before they commit a credit.

**Done-state:** a user with zero balance is blocked before any LLM call is made, and the dashboard
shows real numbers for all five metrics.

---

## Phase 7 — Corpus growth loop (ongoing)

Not a phase with an end. Weekly:

1. Read `corpus_gaps` ranked by demand → that is the ingestion queue.
2. Read `unresolved_terms` ranked by frequency → promote to aliases or new taxonomy nodes.
3. Re-verify links flagged `stale`; demote dead ones.
4. Rebuild bundles for any skill whose corpus changed.

This loop is what makes the product compound. Ship Phase 6 with the dashboards that feed it.

---

## Sequencing summary

```
P0 de-risk ──▶ P1 taxonomy ──▶ P2 skeleton ──▶ P3 corpus ──▶ P4 retrieval ──▶ P5 eval ──▶ P6 metering
   3d            4d             5d             10d            5d              5d           3d
                                                                                     ≈ 7 weeks
```

P3 is the long pole and the one most likely to slip. If time pressure hits, **narrow the corpus to
one role family** (e.g. frontend only, matching your own domain) rather than shipping a shallow
corpus across all of them. A deep corpus for one role is a usable product; a thin corpus everywhere
produces mostly fallbacks and reads as broken.

---

## What is explicitly deferred

- Progress tracking / completion state
- Paid course integrations
- Multi-language JDs
- Community-submitted resources
- Anything agentic (see `agent.md` §2)

# agent.md — Roleform Learning Engine

Operating manual for (a) the **runtime agents** inside the pipeline and (b) any **coding agent**
working in this repo. Read `spec.md` §0 first — the spine governs every rule below.

---

## 1. Invariants

Break any of these and the cost model collapses. They are not style preferences.

| # | Invariant |
|---|---|
| **I1** | No LLM call in S0, S1, S3, S4, S5, S7. Those stages are pure functions or DB reads. |
| **I2** | Retrieved chunk **text** never enters the synthesiser's context. Metadata only. |
| **I3** | Every skill reference in every stage is a canonical `skill_id`. Free-text skill strings exist only between S2 and S3, and nowhere else. |
| **I4** | No resource may appear in output unless it resolves to a live row in `resources` with `status='active'`. |
| **I5** | Exactly one large-model call per run (S6). Adding a second requires a written justification in `decisions.md`. |
| **I6** | Every LLM call declares `max_tokens` and uses a JSON schema. No open-ended generation. |
| **I7** | Cost is checked **before** the first LLM call, never after. |
| **I8** | Ingest-time work is preferred to request-time work in every ambiguous case. |

---

## 2. Why this is a workflow, not an autonomous agent

An autonomous agent decides its own steps, which means it decides its own token spend. When the user
is billed per run, that is an unbounded liability on someone else's card. It also makes the run
non-reproducible, which makes the eval harness in `planning.md` Phase 5 meaningless.

The pipeline is therefore a **fixed DAG**. Stages cannot skip, loop, or invoke each other.

**The one narrow exception — the Adjudicator (S3.5).** When the resolver returns 3+ terms at
confidence 0.70–0.82 (the ambiguous band) *and* they are high-importance, one small-model call may
disambiguate them in a single batch. Constraints:

- At most **one** invocation per run, hard-enforced by a counter, not by prompt instruction.
- Batched — all ambiguous terms in one call, never one call per term.
- Skipped entirely if the run is already over 70% of its token budget.
- Off by default behind a feature flag until Phase 5 proves it improves gap recall by ≥3 points.

If you find yourself wanting a second exception, the resolver's alias table is the thing that needs
work, not the pipeline shape.

---

## 3. Runtime agent roster

| Agent | Stage | Model | Deterministic? | Contract |
|---|---|---|---|---|
| Intake | S0 | — | yes | normalise → hash → dedupe → budget check |
| Segmenter | S1 | — | yes | JD → weighted sections; drops zero-weight sections entirely |
| JD Extractor | S2 | small | no | weighted sections → typed `requirements[]` |
| Resume Extractor | S2b | small | no | resume → `claims[]` with bullet-level spans |
| Resolver | S3 | — | yes | free text → `skill_id[]`; misses → `unresolved_terms` |
| Adjudicator | S3.5 | small | no | flagged, batched, capped, off by default |
| Scorer | S4 | — | yes | requirements + claims → ranked `gaps[]`, hard cap 7 |
| Selector | S5 | — | yes | `skill_bundles` lookup + filters → `resources[]` ≤3 |
| Planner | S5.5 | — | yes | knapsack over durations → ordered sequence |
| Synthesiser | S6 | large | no | gaps + resource **metadata** → narrative + staged bullets |
| Validator | S7 | — | yes | schema, OUT-1…OUT-7, link resolution |

**Ingest-side agents** (offline, never in the request path):

| Agent | Model | Job |
|---|---|---|
| Fetcher | — | pull source, extract text/transcript, detect language, dedupe by content hash |
| Chunker | — | type-aware chunking with context prefixes (`rag-strategy.md` §3) |
| Tagger | small | chunk → `skill_id[]` + level + confidence |
| Scorer (quality) | — | authority, recency, engagement, completeness → `quality_score` |
| Bundle Builder | — | hybrid search + rerank + MMR → `skill_bundles` |
| Verifier | — | weekly link liveness + staleness sweep |

---

## 4. Rules for coding agents working in this repo

**Before writing code**

- Read `spec.md` §0 and §2. If the change moves work from ingest-time to request-time, stop and
  write the justification first.
- Check whether the problem is solvable in the alias table or the bundle builder before reaching for
  an LLM call. It usually is.

**While writing code**

- Deterministic stages go in `lib/pipeline/` as pure functions with no I/O and no network. They must
  be callable from a unit test with a literal input. If a stage needs a DB read, it takes the data
  as an argument.
- LLM calls live only in `lib/llm/`. Never inline a model call in a route handler or a React server
  component.
- Every prompt lives in `prompts/` as a versioned file, never as a string literal in application
  code. Prompt changes are reviewable diffs.
- Structured output is mandatory. Define the Zod schema first, derive the JSON schema from it, and
  parse the response through it. An unparsed model response is a bug.
- Log `tokens_in`, `tokens_out`, `model`, `cache_hit`, `stage` on every call. Untracked spend is the
  failure mode this whole design exists to prevent.

**Testing posture** (per project preference)

- Do not write a test suite mid-phase. Verify at the phase boundary against the done-state in
  `planning.md`.
- Exception: the deterministic scorers (S4) and the resolver (S3) get unit tests as they are
  written. They are pure functions, the tests are three lines each, and every downstream number
  depends on them being right.

**Never**

- Never add a retry loop around an LLM call without a hard attempt cap and a token budget check
  between attempts.
- Never expand a prompt to fix a bad output when the fix belongs in the pipeline. Prompts grow
  monotonically and every added line is billed on every run forever.
- Never fetch from a third party (including roadmap.sh) inside the request path.
- Never let S6 see raw chunk text, however convenient it seems for one feature.

---

## 5. Model routing

| Stage | Tier | Why |
|---|---|---|
| S2, S2b, S3.5, Tagger | small | Structured extraction against a fixed schema. Quality difference vs. a large model is small; cost difference is ~10×. |
| S6 | large | The only stage whose output the user reads as prose. Quality is visible here and nowhere else. |

Route by capability, not by habit. Before promoting any stage to a larger model, run the golden set
on both and show the delta. "It felt better" is not a reason to multiply the bill on every run.

---

## 6. Prompt caching layout

Order every prompt so the static parts sit in the cacheable prefix:

```
[ CACHED ]  system instructions
[ CACHED ]  output schema
[ CACHED ]  few-shot examples
[ CACHED ]  taxonomy slice (only if stable across runs — see note)
─────────────────────────────────────────
[ VARIABLE ] the JD sections / the gap list
```

Never interleave variable content into the cached region — a single variable token near the top
invalidates everything after it. If a "cached" block changes per-run, it is not cached; move it
below the boundary and stop pretending.

*Taxonomy slice note:* do not paste the taxonomy into the extractor prompt. The extractor emits free
text and S3 resolves it. Sending taxonomy nodes into context is a request-time cost for something
the database already does for free — a direct violation of I8.

---

## 7. Failure posture

Degrade, don't fail. In priority order, a run should return:

1. Full payload.
2. Gaps + resources, no narrative (S6 failed) — still genuinely useful.
3. Gaps only, all resources as roadmap fallbacks (corpus unreachable).
4. Hard error, credit refunded.

A user who paid a credit should never receive nothing. If the run cannot reach level 3, refund
automatically and log it — do not make them ask.

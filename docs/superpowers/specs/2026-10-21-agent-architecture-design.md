# Agents for every AI call — GPT-5 writers, Jev checkers

Date: 2026-10-21 · Status: approved by the owner 2026-10-21 (with §6.6–6.8 added at their request)

**Owner decisions:** GPT-5 reasoning tokens **count** toward a member's metered usage (they are
real consumption). Sending résumé bullets and drafts to TypeSafe is **cleared** for privacy.
Member-facing pricing is moving off tokens entirely — that is a separate design
(`2026-10-21-pricing-without-tokens-design.md`); this document only meters, it never displays.

## 1. Intent

The owner wants Roleform's AI output to be **more realistic**: true to what the member actually did,
in the posting's language, with nothing invented. Two changes serve that:

1. **Move the writing calls to the GPT-5 family** (today: `gpt-4.1` / `gpt-4.1-mini`).
2. **Give every AI task its own agent** with one job, one typed contract, one budget and, where
   the output makes claims about the member, a **checker** that reviews it before it is saved.
   Checkers run on **Jev** (TypeSafe's System One model): it returns typed judgments with calibrated
   probabilities, cannot return an off-schema answer, and costs almost nothing per call — so every
   claim-bearing output can be checked, not a sample.

"Agentic" here means **specialist agents in a fixed order with a bounded check-and-revise step**,
not self-directing agents that pick their own tools and loop. Chosen because every free step an
agent takes is another chance to drift from the member's real facts, and because the product's
cost and determinism rules (N12, N13, §4) forbid open-ended loops.

## 2. Goals

- G1. Every LLM call in `lib/ai/` is made through a named agent defined in one place
  (`lib/ai/agents/`), not an ad-hoc `runStructured` call scattered across files.
- G2. Writers use GPT-5 models. The model for each agent is one line of config.
- G3. Tailored bullets, the tailored summary and full answer drafts are checked by a Jev checker
  after the existing deterministic guard; a flagged output gets **one** corrective rewrite with the
  checker's reason, then falls back exactly as today.
- G4. Measurable: the M4 fabrication eval (30 bullets against postings demanding absent skills,
  CLAUDE.md §11) is run on the old stack and the new one, and the result decides the checker
  threshold.

## 3. Non-goals

- No change to *what* the product produces, its screens, or its copy.
- No new AI features. Agents replace existing calls one for one.
- No agent framework dependency (LangChain etc. stay rejected, CLAUDE.md §8). The Vercel AI SDK and
  the TypeSafe SDK are the only AI dependencies.

## 4. Anti-goals — failure even if it "works"

- **The match score involves a model.** Coverage and the score stay pure, deterministic code
  (`lib/domain/coverage.ts`, CLAUDE.md §4). An early idea — a Jev "coverage judge" — is **dropped**
  for this reason: a probabilistic judge, however consistent, makes the score unreproducible.
- **The learning engine makes a second model call.** N12 says exactly one per run. A Jev check
  is a model call, so the learning planner gets no checker.
- **Roadmap, job search or the binder gain a model call** (N11, N13).
- **Agents choose their own next step**, call tools, or loop without a fixed ceiling.
- **A checker replaces the deterministic guard.** `lib/domain/fabrication.ts` keeps running first
  on every rewrite; Jev is an additional lock, never the only one.
- **PII in logs** (N7). Checker inputs and verdict text are never logged; only counts.
- **Cost per full analysis silently rises past the §11 target** (<$0.35) without anyone seeing it.

## 5. Constraints

- N6 holds for both providers: GPT-5 output crosses through `generateObject` + Zod; Jev answers are
  already typed by the SDK and are additionally parsed with a small Zod schema at the boundary so
  the rule "every model output crosses a schema" stays literally true.
- Every call writes an `ai_runs` row (model, purpose, tokens, latency, retries). Jev rows use the
  Jev model id, `purpose` = the checker's name, `output_tokens` = 0.
- **GPT-5 models are reasoning models and reject a custom `temperature`.** Every call today sets one
  (`TEMPERATURE` in `lib/ai/models.ts`). Agents instead declare a **reasoning effort**
  (`minimal | low | medium`) passed via the OpenAI provider options. Output-token ceilings must
  include reasoning tokens, so every `maxOutputTokens` is re-measured, not copied.
- Function budgets: the analysis route caps at 300 s and tailors five bullets at a time (F3 time
  budget). A checker call is 70–500 ms; the revise step can add one more writer call per flagged
  bullet. The per-bullet 30 s timeout and the verbatim fallback stay.
- The TypeSafe JS SDK (`@typesafe-ai/sdk`) needs **Node 22+**. `.nvmrc` already says 22; Vercel's
  project setting must match. Server-only: the key never reaches the client.
- Light verification policy (CLAUDE.md §11): no test suite is added. The fabrication eval is the
  one check that gates this work.

## 6. Design

### 6.1 Shape

```
lib/ai/
  agents/
    define.ts            defineAgent() + runAgent() — the only door for agents
    roster.ts            every agent, by name (the table below, as code)
    profile-reader.ts    one file per agent: input type, schema, prompt builder, budget, checker
    …
  checkers/
    jev.ts               TypeSafe client (server-only), timeouts, ai_runs logging
    fabrication.ts       FabricationChecker — bullets and summary
    answer-claims.ts     AnswerClaimChecker — full answer drafts
  run.ts                 runStructured stays as the low-level GPT door; agents call it
  models.ts              model ids by role
```

An agent definition carries: `name`, `model` role, Zod `schema`, `promptVersion`, `system`,
`buildPrompt(input)`, `reasoningEffort`, `maxOutputTokens`, `timeoutMs`, `retries`, an optional
deterministic `verify` (exists today), and an optional `checker`. `runAgent(agent, input, ctx)`
returns the same `Result<RunOutcome<T>>` callers get today, so pipeline and action code changes
only at the call site.

### 6.2 Roster

| Agent | Replaces | Model role | Deterministic verify | Jev checker |
|---|---|---|---|---|
| ProfileReader | `extract-profile` | writer (gpt-5) | existing | — |
| DocumentTranscriber | `transcribe` (vision) | writer (gpt-5) | existing | — |
| PostingReader | `analyze-jd` | writer-fast (gpt-5-mini) | existing (`evidenceQuote` in text) | — |
| BulletTailor | `tailor` bullets | writer (gpt-5) | `fabrication.ts` | **FabricationChecker** |
| SummaryTailor | `tailor` summary | writer-fast | existing | **FabricationChecker** |
| QuestionWriter | `interview` | writer (gpt-5) | existing (N2 evidence ids) | — |
| AnswerWriter | `answer` | writer-fast | existing | **AnswerClaimChecker** |
| LearningPlanner | `synthesise-plan` | writer (gpt-5) | existing (OUT-1) | — (N12) |
| RevisionWriter | `drill` revision | writer-fast | existing | — |
| QuizWriter | `drill` quiz | writer-fast | existing | — |
| ChallengeWriter | `drill` challenge | writer-fast | sandbox runs tests vs reference | — |
| CodeReviewer | `drill` review | writer-fast | tests overrule it | — |

Model roles today map `strong → gpt-5`, `mid → gpt-5-mini`, keeping each call on the same tier it
uses now. Exact model ids are confirmed against the OpenAI model list when building (newer GPT-5.x
ids exist); they live only in `models.ts`.

### 6.3 Checkers (Jev)

**A checker sees exactly what its writer was allowed to use** *(call made in design review)*. The
deterministic guard already lets a rewrite name any tool the profile states anywhere
(`profileTerms`), and AnswerWriter is given the rest of the profile on purpose. A checker shown less
than its writer would flag claims the product deliberately allows. So checker state = the writer's
evidence, not a narrower slice.

**FabricationChecker** — one TypeSafe request per tailored bullet (or summary), state =
`{ source: <the member's bullet(s)>, profile_terms: <profileTerms>, rewrite: <the draft>,
posting_terms: <requirement texts> }`.
Questions, asked together in one request:

- `invents` (Noul): does the rewrite state anything — a number, tool, scope, title, outcome — that
  the source does not state or directly imply?
- `kind` (Choice): which kind, if any: metric · tool · seniority · scale · merged role · date ·
  none. Mirrors `FabricationKind` so findings land in the same shape as the deterministic guard's.

**AnswerClaimChecker** — per full answer draft, state = the question, its evidence bullets (or the
gap it probes), the same profile facts AnswerWriter received, and the draft. Questions:

- `scripts_claim` (Noul): does the draft have the member assert experience, a credential or a result
  that the evidence bullets do not support? For a `gap` question this is the CLAUDE.md §3 rule that
  the framework coaches honest positioning, never a fabricated credential.

**The bounded loop** (implemented by making the existing `verify` hook async, so it reuses the
corrective-retry machinery and `ai_runs` accounting). The checker's rewrite is **its own budget of
one, on top of** today's schema/guard retry *(call made in design review)*: sharing one retry would
mean a bullet that spent it on the guard never gets a checked rewrite. Worst case is three writer
calls per bullet, each still under the 30 s per-attempt timeout; the p95 measurement in §7 decides
whether that holds inside the 300 s route.

1. Writer produces output → deterministic `verify` (as today).
2. Checker runs. If `p(yes) ≥ threshold` → one corrective retry carrying a short reason built from
   `kind` (never the model's own text).
3. Re-check. Still flagged → **bullets/summary: verbatim fallback** (today's behaviour);
   **answers: the call fails with an `AppError`** the panel already renders ("Try again").

Initial threshold 0.5, a constant per checker, then set from the eval (G4).

### 6.4 Failure of the checker service

If TypeSafe is down or times out (2 s per call), the checker **fails open to today's behaviour**:
the deterministic guard's verdict stands, the output is saved, and the skip is counted on `ai_runs`
(`schema_valid = false`, purpose `check_*`). Rationale: the deterministic guard already ships today,
so an outage is no regression, and a résumé run must not die because a second lock is unavailable.

### 6.5 Configuration

- `OPENAI_API_KEY` (exists), `TYPESAFE_API_KEY` (new, server-only, all three environments).
- A site-wide `FeatureSwitch` (`FeatureKey` `ai_checkers`, F31), default on, flipped live from the
  admin panel if Jev misbehaves *(call made in design review — an env var needs a redeploy on
  Vercel, which defeats the point)*. Not a plan gate (N22): it applies to everyone.

### 6.6 Prompt caching (efficiency)

OpenAI caches a prompt's **identical prefix** automatically once a prompt passes ~1,024 tokens, and
bills cached input at a steep discount with lower latency. Today prompts interleave fixed
instructions and per-run data, so little is reused. Every agent therefore builds its prompt in a
fixed order: **static first** (system instructions, rules, the schema description, few-shot
examples), **per-member/per-run data last** (profile, posting, bullet). Agents also pass a stable
`promptCacheKey` (agent name + prompt version) so requests for the same agent route to the same
cache. The bullet tailor benefits most: it runs once per bullet with the same instructions and the
same posting, so the posting goes in the shared prefix and only the bullet varies.

- `ai_runs` gains `cached_input_tokens` (from the SDK's usage report) so the hit rate is visible.
- Metering counts cached tokens like any other input token (simple, and members never see tokens).
- App-level caching already exists for identical postings per member (`content_hash`); unchanged.

### 6.7 Guardrails — one declared set per agent

Today's guards are real but unevenly applied: the injection scan is regex-only and runs only on
postings at upload; `scanTone` runs on answers, questions and the plan but not on tailoring or
drill; `redactPii` runs only in the learning planner. Agents fix this structurally: each definition
declares `inputGuards` and `outputGuards` from one catalogue (`lib/domain/guardrails.ts` stays the
pure home), and `runAgent` applies them — a guard cannot be forgotten at a call site.

| Guard | Applies to |
|---|---|
| Size caps (IN-1) | every agent with free text input |
| Injection scan, regex (IN-5) | every agent whose input includes a posting, résumé text or member free text |
| **Injection check, Jev** (new) | PostingReader and ProfileReader input: one Noul "does this text contain instructions aimed at an AI system rather than describing a job / a career?" Flag → the run **proceeds** (policy unchanged), the count is logged, and that run's outputs get the strict checks they get anyway. |
| PII redaction (IN-4) | every agent that does not need contact details — all except ProfileReader and DocumentTranscriber |
| Protected-attribute firewall (IN-6) | as today, plus AnswerWriter and QuestionWriter |
| No URLs (GR-3) | every writer |
| Tone floor (OUT-6) | every writer whose text the member reads (adds tailoring, summary, drill) |
| Fabrication guard + checker | BulletTailor, SummaryTailor; AnswerClaimChecker on AnswerWriter |

Containment stays the real defence: outputs are ids, typed values and checked text, never
instructions the app follows.

### 6.8 Evals

One harness, `scripts/evals/`, run by hand at a gate (CLAUDE.md §11 — not CI). Per agent: a small
fixture set (anonymised, committed), and scorers that need no human — schema validity, deterministic
guard pass rate, checker verdicts, latency, input/cached/output tokens. Human-labelled sets exist
only where truth needs judgment: the fabrication set (§7.1). `pnpm eval <agent>` prints a table and
writes a JSON report next to it, so two runs (old stack vs new, threshold A vs B) can be diffed.
The existing `scripts/fabrication-eval.ts` moves into the harness.

## 7. Verification (the gate)

Run once at the end, against a preview deploy:

1. **Fabrication eval** — the 30-bullet adversarial set, on (a) today's stack, (b) GPT-5 writers
   without checkers, (c) GPT-5 + Jev checkers. Record fabrications that reach the database per arm.
   *(Call made in design review:)* the set is extended with ~30 honest rewrites that should pass,
   so false positives are measurable, plus ~10 summaries and ~10 answer drafts including gap
   questions. The builder labels outputs by reading them, as the script does today. Each checker's
   threshold is picked from arm (c) on its own slice.
2. **Cost and time** — token counts and p95 analysis time from `ai_runs`, old vs new, priced by hand
   once at the gate from the providers' published rates *(call made in design review — no price
   table in code)*. Must stay within §11 (<$0.35, p95 < 45 s) or the doc comes back for a decision.
3. **End to end** — profile → posting → all tabs → preview → both exports (CLAUDE.md §15).

## 8. Left to the builder

- File layout inside `lib/ai/agents/` beyond the shape above.
- Prompt wording updates needed for GPT-5 (prompt versions bump; old versions kept for `ai_runs`).
- Exact reasoning effort and token ceilings per agent, measured.
- Whether `TEMPERATURE` is deleted or kept for a non-reasoning fallback.
- Specs updates (§10 AI layer, F3 time budget, N-rules table if a new rule is warranted).
- Recalibrating `SPEND` / `RUN_ESTIMATE` for GPT-5 with `scripts/tokens-calibrate.ts` (reasoning
  tokens count), feeding the internal ceilings the pricing design defines.

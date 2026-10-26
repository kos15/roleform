# guardrails.md — Roleform Learning Engine

Three classes: **input** (before any LLM call), **output** (before anything reaches the user), and
**cost** (spans both). Every guardrail is enforced in code, never by prompt instruction alone —
a model told not to do something is a suggestion; a validator is a rule.

---

## Input guardrails

Ordered by cost. Cheap checks run first so an expensive check never runs on input that a free check
would have rejected.

### IN-1 · Size caps (free)
- JD: 200–20,000 chars. Under → "that looks like a job title, paste the full posting." Over →
  truncate to the highest-weight sections, tell the user what was dropped.
- Resume: 300–30,000 chars.
- Rejected before hashing, before any model call.

### IN-2 · Language detection (free)
English only in v1. Non-English → clean refusal naming the limitation. Do not attempt a run; a
mislabelled non-English JD produces garbage gaps and still bills the user.

### IN-3 · Is-this-actually-a-JD (near-free)
Heuristic classifier: requires ≥2 of {a requirements-shaped section, a role title pattern, ≥3
resolvable skill terms, employment keywords}. Fails → refuse with a specific reason. This is the
single highest-ROI guardrail — it stops the "pasted a random article" case before it costs anything.

### IN-4 · PII redaction (free, mandatory)
Before the resume reaches **any** model: strip phone numbers, email addresses, street addresses,
national ID numbers, date of birth, and photo URLs. Replace with typed placeholders (`[EMAIL]`).
None of these affect skill extraction, so redaction costs nothing in quality and removes the data
from every downstream log, cache, and provider request.

Names are retained — they appear in project attributions — but see IN-6.

### IN-5 · Prompt injection (near-free)
JD text is **untrusted third-party content**, not user instruction. Users paste JDs from job boards
that anyone can post to.

Defences, in order:
1. **Structural** — JD text is passed inside a delimited block, and the system prompt states that
   content in that block is data to analyse, never instruction to follow.
2. **Pattern scan** — flag `ignore previous`, `system:`, `you are now`, `disregard`, role markers,
   base64 blobs, and zero-width characters. Flagged runs proceed but are logged and get stricter
   output validation.
3. **Output containment** — this is the real defence. The synthesiser's output is schema-validated
   and every resource ID is checked against the DB (OUT-1). An injected instruction cannot produce a
   valid resource ID that does not exist, so the blast radius is bounded to narrative text, which
   OUT-2 also constrains.

Assume injection will get through the scanner. Design so it does not matter.

### IN-6 · Protected-attribute firewall (free)
- Never infer or use nationality, ethnicity, gender, age, religion, disability, or immigration
  status from a name, a school, a photo, a graduation year, or a location.
- Extraction schemas contain no field that could carry these. **Wrong states unrepresentable** beats
  policing them after the fact.
- If a JD itself contains a discriminatory requirement ("under 30", "native speaker only"), do not
  propagate it into gaps or narrative. Flag it once to the user, neutrally: *"This posting includes a
  requirement that may not be lawful in some jurisdictions — we've excluded it from your analysis."*
- Never generate learning recommendations aimed at a protected attribute (accent reduction,
  age-appearance). Hard blocklist at the skill-node level.

---

## Output guardrails

### OUT-1 · No invented resources (critical)
Every `resource_id` in the payload must resolve to a live `resources` row with `status='active'`.
Every URL must be read **from the database**, never from model output — the synthesiser is given IDs
and titles and returns IDs; the serialiser looks up the URL. A model cannot invent a link it was
never asked to write.

Violation → strip the resource, one repair retry, then degrade to fallback. Log as sev-2; a
recurring OUT-1 means the S6 prompt is drifting and needs a version bump, not a patch.

### OUT-2 · No invented candidate facts (critical)
The product principle is *"Nothing is invented — bullets are reordered, reworded and re-weighted."*
`unlocks_bullet` must be **traceable to an existing resume span**, and must be framed
prospectively — *"after this, you can rewrite bullet 4 to say…"* — never as a claim the candidate
can make today.

Validator: every staged bullet carries a `source_span` pointing into the stored resume. No span →
rejected, no exceptions.

Explicitly banned: inventing years of experience, project outcomes, metrics, employers, or titles.

### OUT-3 · Schema conformance
Parse through the Zod schema. Fail → one repair retry with the validation error appended. Fail again
→ degrade per `agent.md` §7. Never ship a partially-parsed payload.

### OUT-4 · Grounded claims
Each gap's `why_it_matters` must quote or reference an actual JD span, stored as a character offset.
Ungrounded reasoning is where a model quietly invents requirements the posting never made.

### OUT-5 · Evidence honesty
Never inflate a bucket. If evidence is `Partial`, the narrative may not describe it as strong. The
score and the prose are generated from the same deterministic `evidence` value, so they cannot
disagree — the synthesiser receives the bucket label, not the freedom to choose one.

### OUT-6 · Tone floor
This output lands on someone who is job-hunting, which is a stressful state. The narrative:
- names gaps as **learnable and specific**, never as deficiency;
- never speculates about rejection odds or employability;
- never compares the user to other candidates;
- leads with what already matches before what does not.

Enforced by prompt (`prompts.md` §5) and spot-checked in the Phase 5 eval, not by a classifier.

### OUT-7 · Link liveness
Weekly verifier sweep. Dead → `status='dead'`, excluded from bundles immediately. Redirected →
update URL. Video removed/privated → `dead`. A recommendation that 404s destroys more trust than a
missing recommendation.

---

## Cost guardrails

### COST-1 · Pre-flight budget check
Before the first LLM call: estimate tokens from input length + cache state, compare against the
user's balance and the per-run ceiling. Insufficient → refuse **before** spending anything. Never
discover an overrun after the fact.

### COST-2 · Hard per-run ceiling
A configured max (suggest 15k tokens) enforced by an accumulator between stages. Exceeded → stop and
serve the best available degraded payload. Log for investigation; a run hitting the ceiling means
either an unusual input or a regression, and both are worth knowing about.

### COST-3 · Retry cap
Max 1 repair retry per stage, max 2 per run. Retries are counted in the same budget as first
attempts. No exponential backoff loops around a paid API — that is how a bug becomes an invoice.

### COST-4 · Circuit breaker
If rolling 1h average cost/run exceeds 2× the Phase 5 measured baseline, alert and switch the S6
route to the small model until manually cleared. Better a degraded product for an hour than an
unexplained bill.

---

## Corpus guardrails

- **Licensing** — index only what you may link to and quote from. Store `license` per resource; never
  serve extracted PDF/transcript text as the primary content. The product sends users *to* the
  source with a precise entry point; it does not replace it.
- **Quality floor** — resources below `quality_score` threshold never enter a bundle.
- **Diversity** — max 2 resources from one channel/author per bundle. Prevents a single prolific
  creator from monopolising a skill.
- **Freshness** — for `volatility='high'` skills, hard-drop anything older than 18 months regardless
  of quality.
- **Quarantine** — anything failing ingest goes to `quarantined` with a reason, never silently
  dropped. Silent drops make corpus coverage unknowable.

---

## Privacy

- Resume text is stored encrypted at rest, keyed to the user, deletable on request (cascade through
  `resume_versions`, `runs`, and any cached extraction).
- `jd_cache` stores **JD text only** — never joined to a user in the cache table. The JD is public
  content; the pairing is not.
- Redacted PII never reaches a model provider, so it never enters a provider-side log.
- Do not log full resume text in application logs. Log the hash.

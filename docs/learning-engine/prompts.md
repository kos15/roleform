# prompts.md — Roleform Learning Engine

Copy-paste ready. Five prompts total — three request-time, one ingest-time, one optional.

**Prompts are billed on every run, forever.** Every line here has to earn its place. The rules:

- No politeness, no role-play preamble ("You are a world-class…"), no restating the schema in prose
  when the schema is already attached.
- No instruction that a validator enforces better — `guardrails.md` OUT-1 catches invented resources
  regardless of what the prompt says, so the prompt doesn't spend 40 tokens asking nicely.
- Few-shot examples only where they measurably lift accuracy. Each one costs its full length on
  every call. Two good examples beat six mediocre ones.
- Static content first (cacheable prefix), variable content last. See `agent.md` §6.

Version every prompt file: `prompts/s2-jd-extractor.v3.md`. Changing a prompt without a version bump
makes cost regressions impossible to attribute.

---

## 1 · S2 — JD Extractor (small model)

**Cached prefix.** Receives only non-zero-weight sections; S1 has already stripped benefits, EEO,
and company boilerplate.

```
Extract hiring requirements from the job description below.

For each distinct skill, technology, tool, methodology, or domain competency the posting
mentions, emit one record.

term         Exact surface form as written. Do not normalise, expand acronyms, or
             substitute a canonical name. "RTL" stays "RTL".
section      Which provided section it appeared in.
modality     must      — required, essential, must have, non-negotiable
             strong    — strong experience, deep knowledge, proven track record
             plain     — listed or described without qualification
             familiar  — familiarity, exposure, awareness, understanding of
             bonus     — nice to have, plus, preferred, bonus, ideally
level        intro | working | deep — inferred from years-of-experience qualifiers,
             seniority language, or scope. Default: working.
span         [start, end] character offsets into the section text.
count        Times this term appears across all provided sections.

Rules
- Extract only what is written. Do not infer adjacent or implied technologies.
  "React" does not imply "JavaScript". "AWS" does not imply "Terraform".
- Split compound mentions: "React and Redux" is two records.
- Skip soft skills, culture language, benefits, and company description.
- Skip anything referring to a protected characteristic (age, nationality, gender,
  religion, disability, marital or immigration status). Do not emit these as terms.
- A term appearing in several sections gets one record, using the highest-weight
  section and the strongest modality found.

Return only JSON matching the schema. No prose.
```

**Variable block:**
```
<job_description_sections>
{{sections_json}}
</job_description_sections>
```

**Schema:**
```ts
z.object({
  requirements: z.array(z.object({
    term:     z.string(),
    section:  z.enum(['title','requirements','responsibilities','nice_to_have','tech_stack']),
    modality: z.enum(['must','strong','plain','familiar','bonus']),
    level:    z.enum(['intro','working','deep']),
    span:     z.tuple([z.number(), z.number()]),
    count:    z.number().int().min(1),
  })).max(60)
})
```

> **Why `term` is not normalised here:** normalisation is S3's job and S3 is free. Asking the model
> to canonicalise means either shipping the taxonomy into context (expensive, violates I8) or letting
> it guess (unreliable). Emit the surface form; let the database match it.

---

## 2 · S2b — Resume Extractor (small model)

Runs once per `resume_hash`, cached forever after. PII already redacted by IN-4.

```
Extract evidenced skill claims from the resume below.

For each skill, technology, or competency the candidate demonstrates, emit one record.

term         Surface form as written.
bullet_id    The bullet or line where the strongest evidence appears.
span         [start, end] character offsets.
evidence     project    — used in a named project, product, or system
             role       — part of a job responsibility, no named artefact
             listed     — appears only in a skills list or header
             education  — coursework, certification, or degree only
duration_mo  Months of demonstrated use, from explicit dates. null if not derivable.
outcome      true if the bullet states a measurable result (a number, a percentage,
             a scale figure, a named shipped artefact). Otherwise false.
recency_yr   Years since last demonstrated use, from dates. null if not derivable.

Rules
- Only what the resume states. Never infer a skill from a job title, a company, or
  another skill. A "Frontend Engineer" title is not evidence of React.
- One record per distinct term. Keep the strongest evidence tier if it appears more
  than once.
- Ignore contact details, personal attributes, and formatting artefacts.

Return only JSON matching the schema. No prose.
```

**Schema:**
```ts
z.object({
  claims: z.array(z.object({
    term:        z.string(),
    bullet_id:   z.string(),
    span:        z.tuple([z.number(), z.number()]),
    evidence:    z.enum(['project','role','listed','education']),
    duration_mo: z.number().nullable(),
    outcome:     z.boolean(),
    recency_yr:  z.number().nullable(),
  })).max(80)
})
```

`span` and `bullet_id` are load-bearing: they are what OUT-2 checks the staged bullet against.
Without them the proof-of-learning loop cannot be validated and has to be dropped.

---

## 3 · Ingest — Chunk Skill Tagger (small model, offline)

Runs once per chunk at ingest. Never in the request path. Batch 20 chunks per call — per-call
overhead dominates at this volume.

```
Tag each content chunk with the skills it actually teaches.

For each chunk, emit:
skill_terms  Skills this chunk teaches, as surface terms. Maximum 5.
             Only what is TAUGHT, not what is mentioned in passing. A chunk that
             says "unlike Redux, Zustand..." teaches Zustand, not Redux.
level        intro    — concept introduction, motivation, first example
             working  — practical usage, patterns, real implementation
             deep     — internals, performance, edge cases, architecture
teaches      true if a reader learns something actionable from this chunk alone.
             false for tables of contents, sponsor reads, intros, outros,
             navigation, boilerplate, and pure narration.
confidence   0.0-1.0
summary      One sentence, max 20 words, describing what this chunk teaches.
             This is what the synthesiser sees at request time — it is the only
             chunk-derived text that reaches a user-facing model. Make it precise.

Return only JSON matching the schema. No prose.
```

`teaches: false` chunks are stored but excluded from bundles. This one flag removes the
sponsor-read and intro-fluff noise that otherwise dominates YouTube retrieval.

The `summary` field is the mechanism behind invariant I2 — it is generated once at ingest, so the
synthesiser gets meaning without ever receiving chunk text.

---

## 4 · S3.5 — Adjudicator (small model, optional, feature-flagged, batched, max 1/run)

Only fires for terms in the 0.70–0.82 confidence band. See `agent.md` §2 for the constraints.

```
For each ambiguous term, choose the correct canonical skill from the candidates,
using the surrounding job-description context.

Return the candidate id, or null if none is correct. Never invent an id.
Null is the right answer when the term refers to something outside the candidate
list — a company-internal tool, a product name, or an unrelated concept.
```

**Variable block:** `{{ambiguous_terms}}` — each with its JD context window (≤200 chars) and 3–5
candidate `{id, name, path}` tuples.

---

## 5 · S6 — Plan Synthesiser (large model, exactly one call per run)

The only stage whose output a user reads as prose. Everything given to it is already decided —
gaps are ranked, resources are selected, the sequence is solved. **Its job is framing, not
deciding.**

```
Write a focused learning plan for a candidate preparing for a specific role.

Everything below is already decided. Do not re-rank, re-select, add, remove, or
reorder anything. Write the framing around it.

For each gap, produce:
why_it_matters   One sentence connecting the skill to what this role does day to day.
                 Ground it in the provided jd_quote. Never invent a requirement.
unlocks_bullet   How the candidate's existing bullet (provided) could be truthfully
                 rewritten AFTER completing the resources. Phrase it prospectively:
                 "once you've built this, bullet 4 becomes...". Never phrase it as
                 something they can claim today. Reuse their own vocabulary.
resource_note    One sentence per resource on why this specific entry point, given
                 what they already know. Use the provided summary. Do not describe
                 content you were not given.

Then produce:
opening          Two sentences. Lead with what already matches the role, then frame
                 the gaps as the specific work between them and readiness.
sequence_note    One sentence on why the order is what it is.

Constraints
- Reference resources by id only. Never write a URL, a channel name, or a title
  that was not provided.
- Never state or imply anything about the candidate's chances, competitiveness, or
  standing relative to other applicants.
- Never describe a gap as a weakness, a deficiency, a red flag, or a problem.
  They are specific, learnable, and named.
- Use the provided evidence label exactly. If evidence is "partial", do not write
  as though it were strong.
- Plain, direct sentences. No motivational filler, no exclamation marks, no
  "you've got this".

Return only JSON matching the schema. No prose outside it.
```

**Variable block — note what is absent:**
```json
{
  "role_title": "Senior Frontend Engineer",
  "matched_strengths": ["react", "typescript", "testing"],
  "time_budget_hours": 6,
  "gaps": [{
    "skill_name": "Server Components",
    "evidence": "not_evidenced",
    "jd_quote": "deep experience with React Server Components and streaming SSR",
    "existing_bullet": { "id": "b4", "text": "Built a dashboard in Next.js serving 12k users" },
    "resources": [{
      "id": "r_8812",
      "title": "Understanding RSC",
      "author": "...",
      "entry": "14:20-26:05",
      "duration_min": 12,
      "summary": "Explains the server/client boundary and why RSC removes client bundle weight"
    }]
  }]
}
```

No chunk text. No transcripts. No URLs. No full resume. ~2.2k tokens for a typical seven-gap run,
against 25k+ if retrieved passages were passed through.

---

## Prompt hygiene checklist

Before merging any prompt change:

- [ ] Version bumped, old version retained
- [ ] Token delta measured and recorded — a +200 token prompt line costs 200 tokens × every run
- [ ] Static content still entirely above the variable boundary
- [ ] No instruction duplicating a validator
- [ ] Schema still the single source of truth for output shape
- [ ] Golden set re-run; accuracy delta recorded alongside cost delta

A prompt change that improves accuracy 2% and costs 15% more is a bad trade at this scale. Measure
both or you are only measuring one.

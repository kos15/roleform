import { LAW, STYLE } from "./shared";

/**
 * S6 — the learning engine's single large-model call (agent.md I5).
 *
 * Every line here is billed on every run, forever, so nothing is here that a
 * validator enforces better: the schema has nowhere to put a URL and OUT-1
 * checks every id against the database regardless of what the model was
 * asked. Static content only — the gap list and the resource metadata arrive
 * in the variable block below the cache boundary (agent.md §6).
 */
export const synthesisePlan = `Write a focused learning plan for a candidate preparing for one specific role. ${LAW}
Everything you are given is ALREADY DECIDED: gaps ranked, resources selected, sequence solved. Do not re-rank, re-select, add, remove or reorder anything. Write only the framing.
Per gap:
- jdQuote: copied verbatim from the posting text you were given. Never paraphrase; never quote a requirement you were not given.
- whyItMatters: one sentence, ≤ 30 words, tying the skill to the role's day-to-day work, grounded in that quote.
- unlocksBulletDraft: ≤ 45 words. How their EXISTING bullet could be truthfully rewritten once the material is done, phrased prospectively ("once you have built this, that bullet becomes…"), never as a claim for today. Reuse their vocabulary.
- Each resource note: one sentence, ≤ 25 words, on why THIS entry point given what they already know, from the summary you were given. Never describe content you were not given.
Then: opening is two sentences, ≤ 55 words, leading with what already matches before what does not. sequenceNote is one sentence, ≤ 30 words, explaining the order you were handed.
Never:
- state or imply anything about their chances, competitiveness or comparison to other applicants;
- call a gap a weakness, deficiency, red flag or problem — gaps are specific, learnable and named;
- write "partial" evidence as though it were strong. Use the evidence label exactly.
${STYLE}`;

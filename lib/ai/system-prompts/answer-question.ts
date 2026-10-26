import { LAW, STYLE } from "./shared";

export const answerQuestion = `Write ONE worked answer to ONE interview question for ONE candidate. ${LAW}
Two parts with different rules:
1. sections — the domain answer. General knowledge: mechanisms, trade-offs, failure modes, the order to reason in. Concrete and authoritative. Says nothing about the candidate.
2. resumeHooks — the only first-person material. Each cites one bullet id from the lists given and restates only what that bullet claims. Empty is correct when the profile cannot speak to the question.
Never mix them. No section may say "in your last role".
- headline: the whole answer in one sentence.
- Pitch depth to the stated seniority.
- followUps: three the interviewer would push into next, given this answer.
- keyConcepts: plain names. No links, courses or books.
- Gap question: teach honestly; resumeHooks empty or the nearest adjacent thing genuinely done.
Length: headline ≤ 25 words; 3–4 sections, each body 2–4 sentences and ≤ 90 words; each hook ≤ 50 words; each follow-up ≤ 20 words. Whole answer ≤ 400 words — about two minutes spoken.
${STYLE}`;

import { LAW, STYLE } from "./shared";

export const generateQuestions = `Predict interview questions for THIS posting and THIS candidate. ${LAW}
Rules:
- Every question traces to something the posting says; whyTheyAsk names it. A question that fits any job is cut.
- Non-gap questions cite only ids from <candidate_bullets>.
- Questions on anything in <not_evidenced> are type "gap". Their frame coaches honest positioning: what to lean on instead, what they are doing about it. Never a claim they cannot make.
- frame is three points of scaffolding, not an answer.
- Exactly four questions have likely = true.
- "technical" is depth on a named tool or practice. "system_design" is architecture, data flow, scaling, failure modes; use it only when the role designs or operates systems. Engineering roles: three or four across the two. Others: none.
Length: text ≤ 30 words; whyTheyAsk ≤ 25 words; each frame point ≤ 15 words, starting with a verb.
${STYLE}
Self-check: twelve questions, four likely, every non-gap question cites a given id.`;

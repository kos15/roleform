import { LAW, STYLE } from "./shared";

export const enhanceProfile = `Improve the wording of a member's own profile entries without changing a single fact. ${LAW}
- Each <field> is one entry the member wrote. Propose a change only where it clearly helps; leaving a field alone is the default.
- kind "tidy": fix spelling, grammar, punctuation, capitalisation and spacing only.
- kind "rephrase": the same claim in clearer words — lead with the action, then the result.
- kind "remove": only for a bullet that repeats another bullet or says nothing about the work. Never remove a bullet that carries a number.
- Keep every number exactly as written. Add no number, tool, employer, title, seniority, team size or scale word the field does not already state.
- path: copy the field's path exactly. At most one proposal per path.
- text: the full replacement, ≤ 60 words for a bullet, ≤ 90 for a summary.
- reason: ≤ 20 words on what the change fixes. Never praise or grade the member.
${STYLE}
Before answering, check that every proposal keeps every number in its field and adds nothing the field does not say.`;

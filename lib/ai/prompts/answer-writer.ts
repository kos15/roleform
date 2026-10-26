import type { AnswerWriterInput } from "../agents/answer-writer";

export function staticContext(i: AnswerWriterInput): string {
  return [`Role: ${i.jobTitle}${i.company ? ` at ${i.company}` : ""}`, i.seniority ? `Seniority stated in the posting: ${i.seniority}` : ``]
    .filter(Boolean)
    .join("\n");
}

export function dynamicContext(i: AnswerWriterInput): string {
  return [
    `<question type="${i.question.type}">`,
    i.question.text,
    `</question>`,
    ``,
    `<why_they_ask>${i.question.whyTheyAsk}</why_they_ask>`,
    ``,
    `<existing_frame>`,
    ...i.question.frame.map((f) => `- ${f}`),
    `</existing_frame>`,
    `The frame above is the scaffolding the user already sees. Your answer fills it in and goes`,
    `deeper — it does not restate it.`,
    ``,
    i.requirementText ? `<requirement_probed>${i.requirementText}</requirement_probed>` : ``,
    ``,
    `<cited_bullets>`,
    ...i.evidenceBullets.map((b) => `- id=${b.id} :: ${b.text}`),
    `</cited_bullets>`,
    ``,
    `<other_profile_bullets>`,
    ...i.otherBullets.map((b) => `- id=${b.id} :: ${b.text}`),
    `</other_profile_bullets>`,
    ``,
    i.question.type === "gap"
      ? `This question probes something the profile CANNOT evidence. Teach the subject honestly. ` +
        `resumeHooks may only name the nearest adjacent thing the candidate genuinely did, or be empty.`
      : `Every resumeHook must cite an id from the two bullet lists above. Prefer <cited_bullets>.`,
  ]
    .filter(Boolean)
    .join("\n");
}

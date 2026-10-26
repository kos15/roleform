import type { QuestionWriterInput } from "../agents/question-writer";

export function staticContext(i: QuestionWriterInput): string {
  return [
    `Role: ${i.jobTitle}${i.company ? ` at ${i.company}` : ""}`,
    ``,
    `<requirements>`,
    ...i.requirements.slice(0, 20).map((r) => `- [${r.necessity}, mentioned ${r.mentionCount}×] ${r.text}`),
    `</requirements>`,
    ``,
    `<not_evidenced>`,
    ...i.absentRequirements.map((r) => `- ${r.text}`),
    `</not_evidenced>`,
    ``,
    `Questions about anything in <not_evidenced> must use type "gap".`,
    `Every other question must cite at least one id from <candidate_bullets>.`,
  ].join("\n");
}

export function dynamicContext(i: QuestionWriterInput): string {
  return [`<candidate_bullets>`, ...i.bullets.map((b) => `- id=${b.id} :: ${b.text}`), `</candidate_bullets>`].join("\n");
}

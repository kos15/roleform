import type { SummaryTailorInput } from "../agents/summary-tailor";

export function staticContext(i: SummaryTailorInput): string {
  return `Role: ${i.jobTitle}`;
}

export function dynamicContext(i: SummaryTailorInput): string {
  return `Bullets already on the résumé:\n${i.bullets.map((b) => `- ${b}`).join("\n")}`;
}

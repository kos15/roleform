import { formatMinutes } from "@/lib/domain/plan";
import { redactPii } from "@/lib/domain/guardrails";
import type { LearningPlannerInput } from "../agents/learning-planner";

/**
 * The variable block. Static instructions live in SYSTEM.synthesisePlan so the
 * cacheable prefix stays intact — a single variable token near the top
 * invalidates everything after it (agent.md §6).
 */
export function dynamicContext(args: LearningPlannerInput): string {
  const lines: string[] = [
    `Role: ${args.jobTitle || "this posting"}`,
    `Already evidenced: ${args.matchedStrengths.slice(0, 12).join(", ") || "nothing yet"}`,
    `Time budget: ${args.budgetMin === null ? "not stated" : formatMinutes(args.budgetMin)}`,
    ``,
    `<gaps>`,
  ];

  for (const gap of args.gaps) {
    lines.push(`- skill: ${gap.skillName}`);
    lines.push(`  evidence: ${gap.evidence}`);
    // Redacted (IN-4): none of this needs contact details, and stripping them
    // keeps them out of the provider's logs as well as ours.
    lines.push(`  posting says: "${redactPii(gap.evidenceQuote || gap.requirementText)}"`);
    if (gap.currentEvidence) lines.push(`  nearest thing they have: ${redactPii(gap.currentEvidence)}`);
    if (gap.existingBullet) {
      lines.push(`  their bullet: "${redactPii(gap.existingBullet.text)}"`);
    } else {
      lines.push(`  their bullet: none — return an empty unlocksBulletDraft`);
    }
    if (gap.resources.length === 0) {
      lines.push(`  material: none — return an empty resources array`);
    }
    for (const resource of gap.resources) {
      lines.push(
        `  material: id=${resource.id} | ${resource.title}` +
          (resource.author ? ` | ${resource.author}` : "") +
          (resource.entry ? ` | start at ${resource.entry}` : "") +
          ` | ${resource.durationMin} min` +
          (resource.summary ? ` | teaches: ${resource.summary}` : ""),
      );
    }
  }

  lines.push(`</gaps>`);
  lines.push(``);
  lines.push(`Return one entry per gap, in the order given, echoing skillName exactly.`);
  return lines.join("\n");
}

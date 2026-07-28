import "server-only";
import { runStructured } from "./run";
import { SkillGapsSchema, type SkillGapOut } from "./schemas/skill-gaps";
import { PROMPT_VERSIONS, SYSTEM } from "./prompts";
import { TEMPERATURE } from "./models";
import type { DomainBullet, Result } from "@/lib/domain/types";

/**
 * Gap notes (F8).
 *
 * The model writes prose only. Which skills are gaps comes from the pure
 * coverage pass; the ordering comes from mention_count; the courses come from
 * the curated catalog by deterministic matching (N8). If this call fails, the
 * Learning tab still works — it just shows the gap without the sentence.
 */
export async function describeGaps(args: {
  clerkUserId: string;
  analysisId: string;
  jobTitle: string;
  gaps: Array<{ skillName: string; requirementText: string; mentionCount: number }>;
  bullets: DomainBullet[];
}): Promise<Result<{ gaps: SkillGapOut[]; aiRunId: string }>> {
  const outcome = await runStructured({
    purpose: "describe_gaps",
    promptVersion: PROMPT_VERSIONS.describeGaps,
    tier: "mid",
    schema: SkillGapsSchema,
    system: SYSTEM.describeGaps,
    prompt: [
      `Role: ${args.jobTitle}`,
      ``,
      `<gaps>`,
      ...args.gaps.map(
        (g) => `- ${g.skillName} :: posting says "${g.requirementText}" (mentioned ${g.mentionCount}×)`,
      ),
      `</gaps>`,
      ``,
      `<candidate_bullets>`,
      ...args.bullets.slice(0, 40).map((b) => `- ${b.text}`),
      `</candidate_bullets>`,
      ``,
      `Return one entry per gap, echoing skillName exactly.`,
    ].join("\n"),
    temperature: TEMPERATURE.analysis,
    clerkUserId: args.clerkUserId,
    analysisId: args.analysisId,
    retries: 1,
    verify: (value) => {
      const wanted = new Set(args.gaps.map((g) => g.skillName));
      const stray = value.gaps.filter((g) => !wanted.has(g.skillName));
      return stray.length > 0
        ? `You returned skills that were not in <gaps>: ${stray.map((g) => g.skillName).join(", ")}.`
        : null;
    },
  });

  if (!outcome.ok) return outcome;
  return { ok: true, value: { gaps: outcome.value.value.gaps, aiRunId: outcome.value.aiRunId } };
}

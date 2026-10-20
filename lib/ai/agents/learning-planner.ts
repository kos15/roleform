import "server-only";
import { LearningPlanSchema } from "../schemas/learning-plan";
import { PROMPT_VERSIONS, SYSTEM } from "../prompts";
import { checkStagedBullet, isGroundedQuote, noUrls, redactPii, scanTone } from "@/lib/domain/guardrails";
import { formatMinutes } from "@/lib/domain/plan";
import type { EvidenceBucket } from "@/lib/domain/severity";
import { defineAgent } from "./define";

export interface SynthesisGap {
  skillName: string;
  evidence: EvidenceBucket;
  /** The stored requirement text and its verbatim JD span, for grounding. */
  requirementText: string;
  evidenceQuote: string;
  /** What the profile DOES show near this skill. Null when nothing does. */
  currentEvidence: string | null;
  /** The bullet that becomes rewritable. Null when no bullet could be bound. */
  existingBullet: { id: string; text: string } | null;
  resources: Array<{
    id: string;
    title: string;
    author: string | null;
    /** "14:20–26:05", "Chapter 4", "docs/routing.md" — never a URL. */
    entry: string | null;
    durationMin: number;
    /** Precomputed at ingest. The only chunk-derived text that reaches here. */
    summary: string | null;
  }>;
}

export interface LearningPlannerInput {
  jobTitle: string;
  /** Canonical skills the profile already evidences. The opening leads with these. */
  matchedStrengths: string[];
  budgetMin: number | null;
  gaps: SynthesisGap[];
}

/**
 * The variable block. Static instructions live in SYSTEM.synthesisePlan so the
 * cacheable prefix stays intact — a single variable token near the top
 * invalidates everything after it (agent.md §6).
 */
function buildPrompt(args: LearningPlannerInput): string {
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

/**
 * LearningPlanner — S6, the plan synthesiser. Exactly one model call per run
 * (N12), so it has no Jev checker: a check is a model call too. Its guards
 * stay in `verify`, scoped to the prose fields they were written for — the
 * declared guard lists are empty so the posting's verbatim `jdQuote` is never
 * tone-scanned. PII is redacted line by line in `buildPrompt`.
 */
export const learningPlanner = defineAgent({
  name: "synthesise_learning_plan",
  promptVersion: PROMPT_VERSIONS.synthesisePlan,
  model: "writer",
  schema: LearningPlanSchema,
  system: SYSTEM.synthesisePlan,
  dynamicContext: buildPrompt,
  reasoningEffort: "low",
  maxOutputTokens: 6_000,
  // COST-3: one repair retry per stage. No backoff loop around a paid API.
  retries: 1,
  inputGuards: [],
  outputGuards: [],
  verify: (value, i) => {
    const wantedSkills = new Set(i.gaps.map((g) => g.skillName));
    const gapByName = new Map(i.gaps.map((g) => [g.skillName, g]));
    const allowedResourceIds = new Set(i.gaps.flatMap((g) => g.resources.map((r) => r.id)));

    const problems: string[] = [];

    const returned = new Set(value.gaps.map((g) => g.skillName));
    const stray = [...returned].filter((s) => !wantedSkills.has(s));
    if (stray.length > 0) {
      problems.push(`These skills were not in <gaps>: ${stray.join(", ")}. Echo the names exactly.`);
    }
    const missing = [...wantedSkills].filter((s) => !returned.has(s));
    if (missing.length > 0) {
      problems.push(`You dropped these gaps: ${missing.join(", ")}. Return one entry per gap.`);
    }

    for (const gap of value.gaps) {
      const source = gapByName.get(gap.skillName);
      if (!source) continue;

      // OUT-1, first half. The second half — "does this id resolve to a live
      // row" — runs in lib/learning/validate.ts against the database.
      for (const resource of gap.resources) {
        if (!allowedResourceIds.has(resource.id)) {
          problems.push(`Resource id "${resource.id}" was not in the material for ${gap.skillName}.`);
        }
      }

      // OUT-4. A paraphrased quote is not a quote.
      if (!isGroundedQuote(gap.jdQuote, source.requirementText, source.evidenceQuote)) {
        problems.push(
          `The jdQuote for ${gap.skillName} is not a span of the posting text you were given. Copy it verbatim.`,
        );
      }

      // OUT-2. An empty draft is allowed when no bullet was bound; a draft
      // that stages a claim they can make today never is.
      if (source.existingBullet && gap.unlocksBulletDraft.trim()) {
        const staged = checkStagedBullet({
          draft: gap.unlocksBulletDraft,
          sourceBulletText: source.existingBullet.text,
        });
        if (!staged.ok) problems.push(`${gap.skillName}: ${staged.reason}`);
      }
    }

    // OUT-6, the hard half.
    const prose = [
      value.opening,
      value.sequenceNote,
      ...value.gaps.flatMap((g) => [g.whyItMatters, ...g.resources.map((r) => r.note)]),
    ].join(" ");
    const tone = scanTone(prose);
    if (!tone.ok) {
      problems.push(
        `Remove language about ${tone.violations.join(" and ")}. Gaps are specific and learnable, ` +
          `and nothing may speculate about their chances or compare them to anyone.`,
      );
    }

    // GR-3, defense in depth on top of OUT-1: the schema has nowhere to
    // put a resource's URL (the serialiser reads it from the database),
    // so a URL in the narrative prose can only be one the model wrote
    // unprompted.
    const urlProblem = noUrls(prose);
    if (urlProblem) problems.push(urlProblem);

    return problems.length > 0 ? problems.join("\n") : null;
  },
});

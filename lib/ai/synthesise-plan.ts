import "server-only";
import { runStructured } from "./run";
import { LearningPlanSchema, type LearningPlanOut } from "./schemas/learning-plan";
import { PROMPT_VERSIONS, SYSTEM } from "./prompts";
import { TEMPERATURE } from "./models";
import {
  checkStagedBullet,
  isGroundedQuote,
  noUrls,
  redactPii,
  scanTone,
} from "@/lib/domain/guardrails";
import { formatMinutes } from "@/lib/domain/plan";
import type { EvidenceBucket } from "@/lib/domain/severity";
import type { Result } from "@/lib/domain/types";

/**
 * S6 — the plan synthesiser. Exactly one large-model call per run (agent.md I5).
 *
 * ── What this call does NOT receive ─────────────────────────────────────────
 * No chunk text. No transcripts. No URLs. No full résumé. No taxonomy.
 *
 * That absence is the single largest token saving in the design (spec §2). The
 * synthesiser's job is sequencing and framing, not summarising, so passing it
 * retrieved passages — the thing that makes naive RAG expensive — would buy
 * nothing and cost roughly ten times as much per run. What it gets instead is
 * the one-line `summary` computed once at ingest, which is invariant I2 made
 * concrete.
 *
 * ── The verify pass is the guardrail, not the prompt ────────────────────────
 * `verify` runs before anything is written, and a failure comes back to the
 * model as a correction exactly once (COST-3 caps retries at one per stage).
 * It checks four things the schema cannot express: that the model echoed the
 * gaps it was given rather than inventing new ones, that every resource id is
 * one we handed it (OUT-1's first half), that every quote is a real span of the
 * posting (OUT-4), and that every staged bullet is prospective and traceable
 * (OUT-2). The tone floor (OUT-6) is checked here too, for the small set of
 * phrasings that are always wrong on this surface.
 */

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

export async function synthesisePlan(args: {
  clerkUserId: string;
  analysisId: string;
  jobTitle: string;
  /** Canonical skills the profile already evidences. The opening leads with these. */
  matchedStrengths: string[];
  budgetMin: number | null;
  gaps: SynthesisGap[];
}): Promise<Result<{ plan: LearningPlanOut; aiRunId: string }>> {
  const wantedSkills = new Set(args.gaps.map((g) => g.skillName));
  const gapByName = new Map(args.gaps.map((g) => [g.skillName, g]));
  const allowedResourceIds = new Set(args.gaps.flatMap((g) => g.resources.map((r) => r.id)));

  return unwrap(
    await runStructured({
      purpose: "synthesise_learning_plan",
      promptVersion: PROMPT_VERSIONS.synthesisePlan,
      // The one stage whose output the user reads as prose. Every other stage
      // in this engine is a pure function or a small-model extraction, and
      // promoting any of them would multiply the bill on every run (agent.md §5).
      tier: "strong",
      schema: LearningPlanSchema,
      system: SYSTEM.synthesisePlan,
      prompt: buildPrompt(args),
      temperature: TEMPERATURE.analysis,
      clerkUserId: args.clerkUserId,
      analysisId: args.analysisId,
      maxOutputTokens: 2_500,
      // COST-3: one repair retry per stage. No backoff loop around a paid API.
      retries: 1,
      verify: (value) => {
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
    }),
  );
}

/**
 * The variable block. Static instructions live in SYSTEM.synthesisePlan so the
 * cacheable prefix stays intact — a single variable token near the top
 * invalidates everything after it (agent.md §6).
 */
function buildPrompt(args: {
  jobTitle: string;
  matchedStrengths: string[];
  budgetMin: number | null;
  gaps: SynthesisGap[];
}): string {
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

function unwrap(
  outcome: Result<{ value: LearningPlanOut; aiRunId: string }>,
): Result<{ plan: LearningPlanOut; aiRunId: string }> {
  if (!outcome.ok) return outcome;
  return { ok: true, value: { plan: outcome.value.value, aiRunId: outcome.value.aiRunId } };
}

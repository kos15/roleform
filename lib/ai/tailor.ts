import "server-only";
import { runStructured } from "./run";
import { TailoredBulletsSchema, TailorSummarySchema } from "./schemas/tailored-bullets";
import { PROMPT_VERSIONS, SYSTEM } from "./prompts";
import { TEMPERATURE } from "./models";
import { checkFabrication } from "@/lib/domain/fabrication";
import type { DomainBullet, DomainRequirement, Result, Transform } from "@/lib/domain/types";

/**
 * Tailoring (F5, M4.1–M4.3).
 *
 * Scoping decision: one call carries ONE bullet and ONE target requirement.
 * The full profile is never sent alongside the JD — that is what stops one
 * role's experience bleeding into another's bullet, and no prompt wording is a
 * substitute for it.
 *
 * Cost decision: each bullet is tailored ONCE against its best-matching
 * requirement, and all six drafts reuse that tailored set with different
 * ordering and omission. Six independent rewrites of the same bullet would
 * multiply spend by six and produce six subtly different versions of one fact —
 * which is exactly the drift the spine exists to prevent.
 *
 * Three layers stand between the model and the database:
 *   1. the Zod schema                       (N6)
 *   2. id verification + one corrective retry
 *   3. the pure fabrication guard, then verbatim fallback
 * The FK is the fourth, and it is the one that cannot be talked around (N1).
 */

export interface TailoredResult {
  sourceBulletId: string;
  originalText: string;
  rewrittenText: string;
  transform: Transform;
  targetsRequirementId: string | null;
  aiRunId: string | null;
  /** Populated when the guard rejected a rewrite and we fell back to verbatim. */
  blockedBy: string[];
}

export async function tailorBullet(args: {
  clerkUserId: string;
  analysisId: string;
  bullet: DomainBullet;
  requirement: DomainRequirement | null;
  profileTerms: string[];
  jobTitle: string;
}): Promise<Result<TailoredResult>> {
  const { bullet, requirement } = args;

  // Nothing on this posting asks for this bullet — keep the user's own words.
  if (!requirement) {
    return {
      ok: true,
      value: {
        sourceBulletId: bullet.id,
        originalText: bullet.text,
        rewrittenText: bullet.text,
        transform: "verbatim",
        targetsRequirementId: null,
        aiRunId: null,
        blockedBy: [],
      },
    };
  }

  const outcome = await runStructured({
    purpose: "tailor_bullet",
    promptVersion: PROMPT_VERSIONS.tailorBullets,
    tier: "strong",
    schema: TailoredBulletsSchema,
    system: SYSTEM.tailorBullets,
    prompt: [
      `Role being applied for: ${args.jobTitle}`,
      ``,
      `<requirement necessity="${requirement.necessity}">`,
      requirement.text,
      `</requirement>`,
      ``,
      `<bullet id="${bullet.id}">`,
      bullet.text,
      `</bullet>`,
      ``,
      `Return exactly one entry, for bullet id ${bullet.id}.`,
    ].join("\n"),
    temperature: TEMPERATURE.tailoring,
    clerkUserId: args.clerkUserId,
    analysisId: args.analysisId,
    // specs §10: one retry, then fail open to the original.
    retries: 1,
    verify: (value) => {
      // M4.2 — id verification. An invented id never reaches the FK.
      const bad = value.bullets.filter((b) => b.sourceBulletId !== bullet.id);
      if (bad.length > 0) {
        return `sourceBulletId must be exactly "${bullet.id}". You returned ${bad
          .map((b) => `"${b.sourceBulletId}"`)
          .join(", ")}.`;
      }
      // M4.3 — content guardrails, before we spend a second round trip on it.
      const findings = value.bullets.flatMap((b) =>
        checkFabrication({
          source: bullet.text,
          rewritten: b.rewrittenText,
          profileTerms: args.profileTerms,
        }),
      );
      if (findings.length > 0) {
        return findings
          .map((f) => `Remove "${f.token}" — ${f.reason}. Only what the source bullet states.`)
          .join(" ");
      }
      return null;
    },
  });

  // Fail open to the original. A verbatim bullet is always defensible; a
  // fabricated one is the single failure this product cannot survive.
  if (!outcome.ok) {
    return {
      ok: true,
      value: {
        sourceBulletId: bullet.id,
        originalText: bullet.text,
        rewrittenText: bullet.text,
        transform: "verbatim",
        targetsRequirementId: requirement.id,
        aiRunId: null,
        blockedBy: [outcome.error.code],
      },
    };
  }

  const returned = outcome.value.value.bullets[0];
  const findings = checkFabrication({
    source: bullet.text,
    rewritten: returned.rewrittenText,
    profileTerms: args.profileTerms,
  });

  if (findings.length > 0) {
    return {
      ok: true,
      value: {
        sourceBulletId: bullet.id,
        originalText: bullet.text,
        rewrittenText: bullet.text,
        transform: "verbatim",
        targetsRequirementId: requirement.id,
        aiRunId: outcome.value.aiRunId,
        blockedBy: findings.map((f) => `${f.kind}:${f.token}`),
      },
    };
  }

  return {
    ok: true,
    value: {
      sourceBulletId: bullet.id,
      originalText: bullet.text,
      rewrittenText: returned.rewrittenText,
      transform: returned.transform,
      targetsRequirementId: requirement.id,
      aiRunId: outcome.value.aiRunId,
      blockedBy: [],
    },
  };
}

/** The one-line `tailorSummary` and the résumé summary paragraph (F5). */
export async function tailorSummary(args: {
  clerkUserId: string;
  analysisId: string;
  jobTitle: string;
  tailored: TailoredResult[];
  profileTerms: string[];
}): Promise<Result<{ summary: string; professionalSummary: string; aiRunId: string }>> {
  const bulletText = args.tailored
    .filter((t) => t.transform !== "omit")
    .map((t) => `- ${t.rewrittenText}`)
    .join("\n");

  const outcome = await runStructured({
    purpose: "tailor_summary",
    promptVersion: PROMPT_VERSIONS.tailorSummary,
    tier: "mid",
    schema: TailorSummarySchema,
    system: SYSTEM.tailorSummary,
    prompt: `Role: ${args.jobTitle}\n\nBullets already on the résumé:\n${bulletText}`,
    temperature: TEMPERATURE.tailoring,
    clerkUserId: args.clerkUserId,
    analysisId: args.analysisId,
    retries: 1,
    verify: (value) => {
      const findings = checkFabrication({
        source: args.tailored.map((t) => t.rewrittenText).join(" "),
        rewritten: value.professionalSummary,
        profileTerms: args.profileTerms,
      });
      return findings.length > 0
        ? findings.map((f) => `Remove "${f.token}" — ${f.reason}.`).join(" ")
        : null;
    },
  });

  if (!outcome.ok) {
    return {
      ok: true,
      value: {
        summary: "Bullets reordered to lead with what this posting asks for.",
        professionalSummary: "",
        aiRunId: "",
      },
    };
  }

  return {
    ok: true,
    value: { ...outcome.value.value, aiRunId: outcome.value.aiRunId },
  };
}

import "server-only";
import { TailoredBulletSchema } from "../schemas/tailored-bullets";
import { PROMPT_VERSIONS, SYSTEM } from "../prompts";
import { checkFabrication } from "@/lib/domain/fabrication";
import type { DomainBullet, DomainRequirement } from "@/lib/domain/types";
import { defineAgent } from "./define";

export interface BulletTailorInput {
  jobTitle: string;
  bullet: DomainBullet;
  requirement: DomainRequirement;
  profileTerms: string[];
}

/**
 * BulletTailor — one bullet, one target requirement (F5). Never the whole
 * posting and never the whole profile: that scoping is what stops one role's
 * experience bleeding into another's bullet, and it outranks prompt caching
 * (these calls are below the ~1,024-token cache floor either way).
 *
 * Guard order on the way out: schema → no links, tone → id check → the pure
 * fabrication guard → (Task 5) the Jev fabrication checker. Failing all of it
 * falls back to the member's own words in tailor.ts.
 */
export const bulletTailor = defineAgent({
  name: "tailor_bullet",
  promptVersion: PROMPT_VERSIONS.tailorBullets,
  model: "writer",
  schema: TailoredBulletSchema,
  system: SYSTEM.tailorBullets,
  staticContext: (i: BulletTailorInput) => `Role being applied for: ${i.jobTitle}`,
  dynamicContext: (i) =>
    [
      `<requirement necessity="${i.requirement.necessity}">`,
      i.requirement.text,
      `</requirement>`,
      ``,
      `<bullet id="${i.bullet.id}">`,
      i.bullet.text,
      `</bullet>`,
    ].join("\n"),
  reasoningEffort: "low",
  // 200 for the answer, the rest for reasoning; Task 8 measures.
  maxOutputTokens: 2_000,
  // A short answer that hasn't arrived in 30s isn't coming; fails open to the original.
  timeoutMs: 30_000,
  // specs §10: one retry, then fail open to the original.
  retries: 1,
  inputGuards: ["pii"],
  outputGuards: ["no_urls", "tone"],
  verify: (value, i) => {
    // M4.2 — id verification. An invented id never reaches the FK.
    if (value.sourceBulletId !== i.bullet.id) {
      return `sourceBulletId must be exactly "${i.bullet.id}". You returned "${value.sourceBulletId}".`;
    }
    // M4.3 — the deterministic guard, before a second round trip is spent.
    const findings = checkFabrication({
      source: i.bullet.text,
      rewritten: value.rewrittenText,
      profileTerms: i.profileTerms,
    });
    if (findings.length > 0) {
      return findings.map((f) => `Remove "${f.token}" — ${f.reason}. Only what the source bullet states.`).join(" ");
    }
    return null;
  },
});

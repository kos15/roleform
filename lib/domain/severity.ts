/**
 * S4 — gap severity. PURE: no I/O, no LLM, reproducible from identical inputs.
 *
 * RLE spec §5 and §6, implemented verbatim:
 *
 *   importance = w_section × w_modality × w_repetition × w_position × w_depth
 *   severity   = importance × (1 − evidence) × 100
 *
 * ── Why this is not an LLM judgement ────────────────────────────────────────
 * Spec §0's second corollary: gap analysis is a set operation on IDs. Every
 * number below is a table lookup or arithmetic over data the pipeline already
 * has. A model asked to rank gaps would cost tokens on every run, produce a
 * different answer on the same input twice, and be unable to explain itself —
 * and this ranking decides what the user spends their week studying.
 *
 * ── Where this implementation substitutes for the spec ──────────────────────
 * Spec §5's `w_section` and `w_modality` read a `section` and a `modality`
 * field that the RLE's own S2 extractor emits. Roleform's existing JD extractor
 * (lib/ai/analyze-jd.ts) emits `kind` and `necessity` instead, over the same JD.
 * Rather than add a second extraction call — which would violate the spine and
 * put a second small-model call on every run for information we already have —
 * the two factors are read off the fields we already extract. The mapping is
 * stated in the tables below so it is auditable rather than buried.
 *
 * The consequence is honest and worth writing down: `w_section` here is a
 * weaker signal than the spec's, because "which section did this appear in" is
 * strictly more informative than "what kind of requirement is it". If the
 * Phase 5 gap eval shows ranking quality below target, adding `section` and
 * `modality` to the existing extractor's schema is the first fix to try — it
 * rides along on a call we are already paying for.
 */

import { hops, nodeFor } from "@/lib/catalog/taxonomy";
import type {
  CoverageStatus,
  DomainBullet,
  DomainCoverageItem,
  DomainRequirement,
  Necessity,
  RequirementKind,
} from "./types";

/** Spec §6: seven gaps is a plan, twenty is a demoralising audit. Also a cost
 *  control — it bounds the synthesiser's input and therefore the per-run bill. */
export const MAX_GAPS = 7;

/* ------------------------------------------------------------- §5 importance */

/**
 * `w_section`, read off `kind`.
 *
 * A stated hard skill is the closest thing we have to "appeared in the
 * requirements list"; a responsibility is the closest thing to "appeared in the
 * responsibilities list". Soft skills sit lowest because this engine recommends
 * technical material and a course cannot close "collaborative".
 */
const W_KIND: Record<RequirementKind, number> = {
  hard_skill: 0.9,
  certification: 0.8,
  experience: 0.75,
  responsibility: 0.7,
  education: 0.6,
  soft_skill: 0.4,
};

/**
 * `w_modality`, read off `necessity`.
 *
 * The spec's five bands collapse onto three because that is genuinely all the
 * existing extractor distinguishes. Inventing a fourth value here would be
 * precision the input does not carry.
 *
 *   required  → the spec's "must"   1.0
 *   implied   → the spec's "plain"  0.7   (stated as a responsibility, never as a bar)
 *   preferred → between "familiar" and "bonus"  0.45
 */
const W_NECESSITY: Record<Necessity, number> = {
  required: 1.0,
  implied: 0.7,
  preferred: 0.45,
};

/** `w_depth` — "React hooks" is more actionable than "frontend" (spec §5). */
function depthWeight(skillName: string | null): number {
  const node = skillName ? nodeFor(skillName) : null;
  if (!node) return 0.9; // unknown shape: neither flattered nor punished
  return node.depth >= 2 ? 1.0 : node.depth === 1 ? 0.9 : 0.75;
}

/** `w_repetition` = 1 + 0.1·ln(count), capped at 1.3 (spec §5). */
function repetitionWeight(mentionCount: number): number {
  return Math.min(1.3, 1 + 0.1 * Math.log(Math.max(1, mentionCount)));
}

/**
 * `w_position` — 1.0 → 0.85 linear across the requirement list.
 *
 * Recruiters front-load. The extractor returns requirements in the order it met
 * them, so index is the proxy for position and it costs nothing.
 */
function positionWeight(index: number, total: number): number {
  if (total <= 1) return 1;
  return 1 - 0.15 * (index / (total - 1));
}

/**
 * Title bonus: a skill named in the job title is the job.
 *
 * Not in the spec's formula, and it is applied as a floor on `w_section` rather
 * than a sixth multiplier, so the formula's shape is unchanged — spec §5 gives
 * `title` the top `w_section` value of 1.0 and this is how a requirement gets
 * there when the JD's own title is the section it appeared in.
 */
function sectionWeight(r: DomainRequirement, jobTitle: string): number {
  const base = W_KIND[r.kind];
  if (!r.skillName || !jobTitle) return base;
  return jobTitle.toLowerCase().includes(r.skillName.toLowerCase()) ? Math.max(base, 1.0) : base;
}

export function importanceOf(
  requirement: DomainRequirement,
  index: number,
  total: number,
  jobTitle: string,
): number {
  const raw =
    sectionWeight(requirement, jobTitle) *
    W_NECESSITY[requirement.necessity] *
    repetitionWeight(requirement.mentionCount) *
    positionWeight(index, total) *
    depthWeight(requirement.skillName);
  return clamp01(raw);
}

/* --------------------------------------------------------------- §6 evidence */

export type EvidenceBucket = "strong" | "partial" | "none";

export interface EvidenceRead {
  credit: number;
  bucket: EvidenceBucket;
  /** The bullets that carried the evidence. Empty when there is none. */
  bulletIds: string[];
  /** Plain-language reason. Rendered to the user, so it must be true. */
  rationale: string;
}

/** A number, a percentage, a scale figure — spec §6's "quantified outcome". */
const QUANTIFIED = /(\d+(\.\d+)?\s?(%|k\b|m\b|x\b|ms\b|s\b|hrs?\b|users?\b|customers?\b))|(\$\s?\d)|(\b\d{2,}\b)/i;

/**
 * The strongest claim the profile makes about one requirement (spec §6).
 *
 * The five bands are the spec's, with one substitution: the spec's "≥12 months
 * duration" test needs a per-claim duration the profile does not store, so the
 * strong band rests on the quantified-outcome half of the same `or`. A bullet
 * with a number in it is the evidence a recruiter reads as strong, which is the
 * thing the band is trying to measure.
 */
export function evidenceFor(
  requirement: DomainRequirement,
  coverage: DomainCoverageItem | undefined,
  bullets: DomainBullet[],
  profileSkillNames: string[],
): EvidenceRead {
  const status: CoverageStatus = coverage?.status ?? "absent";
  const cited = coverage?.evidenceBulletIds ?? [];
  const citedBullets = bullets.filter((b) => cited.includes(b.id));

  if (status === "evidenced") {
    const quantified = citedBullets.some((b) => QUANTIFIED.test(b.text));
    const named = citedBullets.some((b) => b.scope === "work" || b.scope === "project");
    if (quantified) {
      return {
        credit: 1.0,
        bucket: "strong",
        bulletIds: cited,
        rationale: "Your own bullet demonstrates this with a measured result.",
      };
    }
    return {
      credit: named ? 0.85 : 0.7,
      bucket: "strong",
      bulletIds: cited,
      rationale: named
        ? "Your own bullet demonstrates this on a named piece of work."
        : "Your profile demonstrates this, without a named piece of work behind it.",
    };
  }

  if (status === "partial") {
    return {
      credit: 0.5,
      bucket: "partial",
      bulletIds: cited,
      rationale:
        cited.length > 0
          ? "Related experience, but nothing that covers the requirement as stated."
          : "Listed on your profile, but no bullet demonstrates it.",
    };
  }

  // Absent per coverage. The taxonomy gets the last word before we call it a
  // gap: an adjacent node the profile DOES evidence is worth partial credit,
  // and saying so is the difference between "you don't know this" and "you know
  // the thing next to it", which is a materially different sentence to read.
  const near = nearestClaim(requirement.skillName, bullets, profileSkillNames);
  if (near) {
    return {
      credit: near.credit,
      bucket: "partial",
      bulletIds: near.bulletIds,
      rationale: near.rationale,
    };
  }

  return {
    credit: 0,
    bucket: "none",
    bulletIds: [],
    rationale: "Nothing in your profile evidences this yet.",
  };
}

/**
 * Spec §6's taxonomy walk: parent claimed → 0.4, descendant or sibling → 0.5,
 * nothing within 2 hops → 0.0.
 */
function nearestClaim(
  skillName: string | null,
  bullets: DomainBullet[],
  profileSkillNames: string[],
): { credit: number; bulletIds: string[]; rationale: string } | null {
  const target = skillName ? nodeFor(skillName) : null;
  if (!target) return null;

  const claimed = new Set<string>([
    ...profileSkillNames,
    ...bullets.flatMap((b) => b.skillNames),
  ]);

  let best: { credit: number; name: string } | null = null;
  for (const name of claimed) {
    if (name === target.name) continue;
    const distance = hops(target.name, name);
    if (distance === null || distance > 2) continue;

    // A parent claim is worth less than a sibling: "React" against a "Next.js"
    // requirement means the foundation is there but the specific thing is not,
    // whereas "Flask" against "Django" is the same job done in another tool.
    const isAncestor = target.path.includes(name);
    const credit = isAncestor ? 0.4 : 0.5;
    if (!best || credit > best.credit) best = { credit, name };
  }

  if (!best) return null;

  const bulletIds = bullets
    .filter((b) => b.skillNames.includes(best.name))
    .slice(0, 3)
    .map((b) => b.id);

  return {
    credit: best.credit,
    bulletIds,
    rationale: `Your profile evidences ${best.name}, which sits next to this in the same area.`,
  };
}

/* ---------------------------------------------------------------- the ranking */

export interface ScoredGap {
  requirement: DomainRequirement;
  skillName: string;
  importance: number;
  evidence: EvidenceRead;
  /** importance × (1 − evidence) × 100, two decimals. */
  severity: number;
}

/**
 * Rank the posting's requirements by how much studying they would repay.
 *
 * Only requirements that resolved to a canonical skill can become gaps: a gap
 * we cannot name is a gap we cannot match material to, and listing it would be
 * an audit line rather than a plan step. Unresolved terms are handled by S3 and
 * go to `unresolved_terms`, which is how the taxonomy grows.
 */
export function rankGaps(args: {
  requirements: DomainRequirement[];
  coverage: DomainCoverageItem[];
  bullets: DomainBullet[];
  profileSkillNames: string[];
  jobTitle: string;
  limit?: number;
}): ScoredGap[] {
  const coverageById = new Map(args.coverage.map((c) => [c.requirementId, c]));
  const total = args.requirements.length;

  const scored: ScoredGap[] = [];
  for (const [index, requirement] of args.requirements.entries()) {
    if (!requirement.skillName) continue;

    const evidence = evidenceFor(
      requirement,
      coverageById.get(requirement.id),
      args.bullets,
      args.profileSkillNames,
    );
    if (evidence.credit >= 1) continue; // fully evidenced is not a gap

    const importance = importanceOf(requirement, index, total, args.jobTitle);
    scored.push({
      requirement,
      skillName: requirement.skillName,
      importance: round2(importance),
      evidence,
      severity: round2(importance * (1 - evidence.credit) * 100),
    });
  }

  // One gap per skill: the posting saying "React" four times in four
  // requirements is one thing to learn, not four.
  const bySkill = new Map<string, ScoredGap>();
  for (const gap of scored) {
    const held = bySkill.get(gap.skillName);
    if (!held || gap.severity > held.severity) bySkill.set(gap.skillName, gap);
  }

  return [...bySkill.values()]
    .sort((a, b) => {
      if (b.severity !== a.severity) return b.severity - a.severity;
      // Spec §6: ties break toward the shallower node — learn the foundation
      // first, because the deeper node probably depends on it.
      const da = nodeFor(a.skillName)?.depth ?? 0;
      const db = nodeFor(b.skillName)?.depth ?? 0;
      if (da !== db) return da - db;
      return a.skillName.localeCompare(b.skillName);
    })
    .slice(0, args.limit ?? MAX_GAPS);
}

/* --------------------------------------------------------------------- utils */

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

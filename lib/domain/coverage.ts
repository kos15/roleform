/**
 * Coverage + score. PURE — no I/O, no LLM, no imports outside lib/domain.
 *
 * Why no LLM here (specs §8): the score is the number the user trusts to make a
 * decision. It must be deterministic, reproducible from identical inputs, and
 * explainable line by line.
 *
 * The formula is CLAUDE.md §4 verbatim. Do not tune it to flatter anyone:
 *
 *   score = 100 × ( Σ weight(r) × credit(r) ) / ( Σ weight(r) )
 *   weight:  required = 3   preferred = 2   implied = 1
 *   credit:  evidenced = 1.0   partial = 0.5   absent = 0.0
 */
import type {
  CoverageStatus,
  DomainBullet,
  DomainCoverageItem,
  DomainRequirement,
  Necessity,
} from "./types";

export const WEIGHT: Record<Necessity, number> = { required: 3, preferred: 2, implied: 1 };
export const CREDIT: Record<CoverageStatus, number> = { evidenced: 1.0, partial: 0.5, absent: 0.0 };

export interface ScoreResult {
  /** 0–100, two decimals. Never labelled "ATS score" (N4). */
  score: number;
  verdict: string;
  note: string;
  buckets: {
    evidenced: DomainRequirement[];
    partial: DomainRequirement[];
    absent: DomainRequirement[];
  };
}

export function computeScore(
  requirements: DomainRequirement[],
  coverage: DomainCoverageItem[],
): number {
  const byId = new Map(coverage.map((c) => [c.requirementId, c]));
  let weighted = 0;
  let total = 0;
  for (const r of requirements) {
    const w = WEIGHT[r.necessity];
    total += w;
    weighted += w * CREDIT[byId.get(r.id)?.status ?? "absent"];
  }
  if (total === 0) return 0;
  return Math.round((100 * weighted) / total * 100) / 100;
}

/** SVG stroke-dasharray for the results ring (specs §7). Derived at render time. */
export function scoreDash(score: number, circumference: number): string {
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  return `${filled.toFixed(2)} ${(circumference - filled).toFixed(2)}`;
}

function bucketise(requirements: DomainRequirement[], coverage: DomainCoverageItem[]) {
  const byId = new Map(coverage.map((c) => [c.requirementId, c]));
  const evidenced: DomainRequirement[] = [];
  const partial: DomainRequirement[] = [];
  const absent: DomainRequirement[] = [];
  for (const r of requirements) {
    const status = byId.get(r.id)?.status ?? "absent";
    if (status === "evidenced") evidenced.push(r);
    else if (status === "partial") partial.push(r);
    else absent.push(r);
  }
  return { evidenced, partial, absent };
}

/**
 * Calibration in words, never probability. "Strong on delivery, thin on infra"
 * is right; "78% chance of an interview" is a lie (CLAUDE.md §4).
 */
export function scoreVerdict(score: number, buckets: ScoreResult["buckets"]): {
  verdict: string;
  note: string;
} {
  const requiredAbsent = buckets.absent.filter((r) => r.necessity === "required");
  const requiredEvidenced = buckets.evidenced.filter((r) => r.necessity === "required");

  const verdict =
    score >= 80
      ? "Well evidenced"
      : score >= 60
        ? "Broadly evidenced"
        : score >= 35
          ? "Partly evidenced"
          : "Thinly evidenced";

  const strongest = topKinds(requiredEvidenced);
  // Fall back to the wider absent bucket so the note never claims completeness
  // while something is still unevidenced — it just says which kind is thin.
  const weakest = topKinds(requiredAbsent.length > 0 ? requiredAbsent : buckets.absent);

  // Both sides can land on the same label when requirements share a kind and
  // carry no skill name. "Strong on X, thin on X" is nonsense — pick the next
  // distinct label, or drop to a single-sided sentence.
  const weakestDistinct = weakest.filter((w) => w !== strongest[0]);

  const note =
    buckets.absent.length === 0 && buckets.partial.length === 0 && strongest.length > 0
      ? `Your profile evidences every stated requirement, strongest on ${strongest[0]}.`
      : strongest.length > 0 && weakestDistinct.length > 0
        ? `Strong on ${strongest[0]}, thin on ${weakestDistinct[0]}.`
        : weakestDistinct.length > 0
          ? `The items your profile can't yet evidence cluster around ${weakestDistinct[0]}.`
          : strongest.length > 0
            ? `Evidenced in part on ${strongest[0]}, with gaps in the same area.`
            : weakest.length > 0
              ? `Nothing in your profile evidences this posting's ${weakest[0]} yet.`
              : "Not enough stated requirements to characterise the fit.";

  return { verdict, note };
}

function topKinds(reqs: DomainRequirement[]): string[] {
  const counts = new Map<string, number>();
  for (const r of reqs) {
    const label = r.skillName ?? KIND_LABEL[r.kind];
    counts.set(label, (counts.get(label) ?? 0) + r.mentionCount);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

const KIND_LABEL: Record<DomainRequirement["kind"], string> = {
  hard_skill: "technical skills",
  soft_skill: "ways of working",
  experience: "experience depth",
  education: "education",
  certification: "certifications",
  responsibility: "day-to-day scope",
};

export function scoreAnalysis(
  requirements: DomainRequirement[],
  coverage: DomainCoverageItem[],
): ScoreResult {
  const buckets = bucketise(requirements, coverage);
  const score = computeScore(requirements, coverage);
  const { verdict, note } = scoreVerdict(score, buckets);
  return { score, verdict, note, buckets };
}

/* ------------------------------------------------------- deterministic pass */

/**
 * Deterministic coverage: match requirements to bullets on canonical skill
 * names and literal phrase overlap. No LLM (specs §8).
 *
 * evidenced — a bullet names the required skill, or the requirement's key terms
 *             all appear in one bullet.
 * partial   — the skill appears somewhere in the profile's skill list but no
 *             bullet demonstrates it, or only some key terms match.
 * absent    — nothing. This is the Learning tab's input, and it is the honest
 *             answer far more often than tools like to admit.
 */
export function computeCoverage(
  requirements: DomainRequirement[],
  bullets: DomainBullet[],
  profileSkillNames: string[],
): DomainCoverageItem[] {
  const profileSkills = new Set(profileSkillNames.map(normalise));

  return requirements.map((r) => {
    const wantedSkill = r.skillName ? normalise(r.skillName) : null;

    if (wantedSkill) {
      const demonstrating = bullets.filter((b) =>
        b.skillNames.some((s) => normalise(s) === wantedSkill),
      );
      if (demonstrating.length > 0) {
        return {
          requirementId: r.id,
          status: "evidenced" as const,
          evidenceBulletIds: demonstrating.slice(0, 3).map((b) => b.id),
          rationale: `${r.skillName} appears in ${demonstrating.length} bullet${
            demonstrating.length === 1 ? "" : "s"
          } of your own experience.`,
        };
      }
      if (profileSkills.has(wantedSkill)) {
        return {
          requirementId: r.id,
          status: "partial" as const,
          evidenceBulletIds: [],
          rationale: `${r.skillName} is listed on your profile but no bullet demonstrates it.`,
        };
      }
    }

    const terms = keyTerms(r.text);
    if (terms.length > 0) {
      const scored = bullets
        .map((b) => ({ b, hits: terms.filter((t) => normalise(b.text).includes(t)).length }))
        .filter((x) => x.hits > 0)
        .sort((a, b) => b.hits - a.hits);

      if (scored.length > 0 && scored[0].hits === terms.length) {
        return {
          requirementId: r.id,
          status: "evidenced" as const,
          evidenceBulletIds: scored.slice(0, 3).map((x) => x.b.id),
          rationale: "A bullet covers every key term in this requirement.",
        };
      }
      if (scored.length > 0) {
        return {
          requirementId: r.id,
          status: "partial" as const,
          evidenceBulletIds: scored.slice(0, 2).map((x) => x.b.id),
          rationale: "Related experience, but it doesn't cover the requirement as stated.",
        };
      }
    }

    return {
      requirementId: r.id,
      status: "absent" as const,
      evidenceBulletIds: [],
      rationale: "Nothing in your profile evidences this yet.",
    };
  });
}

const STOPWORDS = new Set([
  "with","and","the","for","you","our","are","have","has","will","this","that","from","your",
  "who","all","any","its","their","them","they","must","should","able","work","working","team",
  "teams","strong","good","great","excellent","experience","years","year","using","use","used",
  "into","across","within","plus","etc","other","more","most","well","also","new","full","time",
]);

function keyTerms(text: string): string[] {
  return [
    ...new Set(
      normalise(text)
        .split(/[^a-z0-9+#.]+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
    ),
  ].slice(0, 4);
}

function normalise(s: string): string {
  return s.toLowerCase().trim();
}

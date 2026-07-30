/**
 * Profile strength (F11). PURE.
 *
 * The design's aside says what this number is allowed to mean:
 *
 *   "Strength is how much of a posting we can actually evidence — not how full
 *    the form looks. Numbers in bullets move it most."
 *
 * That rules out the obvious implementation. A completeness meter that ticks up
 * when you fill in a phone number would be measuring the form, and it would be
 * the same class of dishonesty as calling coverage an ATS score (N4): a number
 * that sounds like it predicts something it has no access to.
 *
 * So every factor here is a property of the CORPUS — of how much a posting
 * could be answered from what is written down. The weights say which levers
 * actually move a tailored résumé, and the checks returned alongside are the
 * same computation rendered as sentences, so the list always explains the ring
 * rather than being written next to it.
 *
 * It is deliberately not a percentage of anything. It is a score out of 100 on
 * a stated rubric, reproducible from identical inputs, and the UI never claims
 * more for it than that.
 */

export interface StrengthInput {
  /** Every living bullet on the profile, in the user's own words. */
  bulletTexts: string[];
  /** How many of those bullets a past analysis actually cited as evidence. */
  bulletsUsedAsEvidence: number;
  summary: string;
  /** Skill names with a proficiency set, and the total. */
  skillsWithLevel: number;
  skillCount: number;
  roleCount: number;
  /** A portfolio, writing, or repository link — something to read beyond claims. */
  hasLinks: boolean;
}

export interface StrengthCheck {
  label: string;
  done: boolean;
}

export interface Strength {
  /** 0–100 on the rubric below. Not a probability, not a percentage. */
  score: number;
  checks: StrengthCheck[];
}

/**
 * A bullet counts as quantified when it carries a number that could survive
 * rephrasing into a posting's language — a figure, a percentage, a multiple, a
 * money amount. Deliberately not "contains a digit": a date is not a result.
 */
export function isQuantified(text: string): boolean {
  const withoutYears = text.replace(/\b(19|20)\d{2}\b/g, " ");
  return /\d+(\.\d+)?\s?(%|x\b|k\b|m\b|bn\b|hrs?\b|hours?\b|days?\b|weeks?\b|months?\b)|[$£€₹]\s?\d|\b\d{2,}\b|\b\d+(\.\d+)?\s*(users?|customers?|teams?|engineers?|people|requests?|services?|repos?|tests?|releases?)\b/i.test(
    withoutYears,
  );
}

/** The rubric. Weights sum to 100. */
const WEIGHTS = {
  /** Bullets at all — with none, there is nothing to retarget. */
  hasBullets: 15,
  /** Enough bullets that a posting has something to select from. */
  depth: 15,
  /** Numbers. The single biggest lever on a rewritten bullet. */
  quantified: 30,
  /** Bullets that have already carried an analysis. Proven, not just present. */
  proven: 15,
  /** A summary long enough to be rewritten rather than replaced. */
  summary: 10,
  /** Proficiencies, which bound what a draft is allowed to claim. */
  proficiency: 10,
  /** Something to read beyond the claims. */
  links: 5,
} as const;

const DEPTH_TARGET = 9;
const SUMMARY_MIN = 200;

export function profileStrength(input: StrengthInput): Strength {
  const total = input.bulletTexts.length;
  const quantified = input.bulletTexts.filter(isQuantified).length;

  const ratios = {
    hasBullets: total > 0 ? 1 : 0,
    depth: Math.min(1, total / DEPTH_TARGET),
    quantified: total === 0 ? 0 : quantified / total,
    proven: total === 0 ? 0 : Math.min(1, input.bulletsUsedAsEvidence / total),
    summary: Math.min(1, input.summary.trim().length / SUMMARY_MIN),
    proficiency: input.skillCount === 0 ? 0 : input.skillsWithLevel / input.skillCount,
    links: input.hasLinks ? 1 : 0,
  };

  const score = Math.round(
    (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).reduce(
      (sum, key) => sum + WEIGHTS[key] * ratios[key],
      0,
    ),
  );

  const unquantified = total - quantified;
  const unproven = total - input.bulletsUsedAsEvidence;

  // Both the met and the unmet are listed, in rubric order. A checklist that
  // only shows what is missing reads as nagging; one that only shows what is
  // done reads as flattery. The point is to show where the number came from.
  const checks: StrengthCheck[] = [
    {
      label:
        input.roleCount === 1
          ? "One role with dated bullets"
          : `${input.roleCount} roles with dated bullets`,
      done: input.roleCount > 0,
    },
    {
      label: `Numbers in ${quantified} of ${total} bullets`,
      done: total > 0 && quantified / total >= 0.6,
    },
    {
      label:
        unquantified === 0
          ? "Every bullet carries a number"
          : `${unquantified} bullet${unquantified === 1 ? "" : "s"} still ${unquantified === 1 ? "has" : "have"} no number`,
      done: unquantified === 0,
    },
    {
      label:
        input.bulletsUsedAsEvidence === 0
          ? "No bullet has been used as evidence yet"
          : `${input.bulletsUsedAsEvidence} bullet${input.bulletsUsedAsEvidence === 1 ? "" : "s"} proven in a real analysis`,
      done: input.bulletsUsedAsEvidence > 0 && unproven <= total / 2,
    },
    {
      label: `Summary over ${SUMMARY_MIN} characters`,
      done: input.summary.trim().length >= SUMMARY_MIN,
    },
    {
      label:
        input.skillsWithLevel === input.skillCount && input.skillCount > 0
          ? "Every skill has a proficiency"
          : `${input.skillCount - input.skillsWithLevel} skill${input.skillCount - input.skillsWithLevel === 1 ? "" : "s"} with no proficiency`,
      done: input.skillCount > 0 && input.skillsWithLevel === input.skillCount,
    },
    {
      label: input.hasLinks ? "A portfolio or writing link" : "No portfolio or writing links yet",
      done: input.hasLinks,
    },
  ];

  return { score, checks };
}

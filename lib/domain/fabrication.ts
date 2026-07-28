/**
 * The fabrication boundary, enforced (CLAUDE.md §3). PURE.
 *
 * Three legal transformations of a stated fact:
 *   1. Rephrase    — same claim, the posting's vocabulary
 *   2. Reorder     — surface the relevant, demote the rest (see ordering.ts)
 *   3. Requantify  — only using numbers already present on the source bullet
 *
 * Everything else is fabrication: inventing metrics, upgrading seniority,
 * adding tools absent from the profile, merging roles, extending dates,
 * inferring a skill from an adjacent one.
 *
 * This runs on every rewrite before it reaches the database. It is deliberately
 * blunt: a false positive costs one verbatim fallback, a false negative costs
 * the user their credibility in an interview.
 */

export type FabricationKind = "metric" | "tool" | "seniority" | "scale";

export interface FabricationFinding {
  kind: FabricationKind;
  /** The offending token, for the operator's log. Never shown as user copy. */
  token: string;
  reason: string;
}

export interface GuardInput {
  /** The bullet exactly as the user wrote it. */
  source: string;
  /** The model's rewrite. */
  rewritten: string;
  /**
   * Tools/technologies the profile states anywhere — a rewrite may surface a
   * profile-wide skill onto a bullet only if the source bullet implies it, so
   * this is an allowlist, not a licence.
   */
  profileTerms: string[];
}

/** Seniority ladder. A rewrite may not climb it. */
const SENIORITY = [
  "intern",
  "junior",
  "associate",
  "mid-level",
  "senior",
  "staff",
  "principal",
  "lead",
  "head",
  "director",
  "vp",
  "chief",
];

/** Scale words that imply an unstated magnitude. */
const SCALE_WORDS = [
  "millions",
  "billions",
  "enterprise-scale",
  "world-class",
  "industry-leading",
  "best-in-class",
  "hyper-growth",
  "record-breaking",
  "unprecedented",
];

export function checkFabrication(input: GuardInput): FabricationFinding[] {
  const findings: FabricationFinding[] = [];
  const source = input.source.toLowerCase();
  const rewritten = input.rewritten.toLowerCase();
  const allowedTerms = new Set(input.profileTerms.map((t) => t.toLowerCase()));

  // 1. Metrics — every number in the rewrite must exist in the source.
  for (const n of numbersIn(rewritten)) {
    if (!numbersIn(source).includes(n)) {
      findings.push({
        kind: "metric",
        token: n,
        reason: "number not present on the source bullet",
      });
    }
  }

  // 2. Seniority — no climbing the ladder.
  const sourceRank = highestRank(source);
  const rewrittenRank = highestRank(rewritten);
  if (rewrittenRank > sourceRank) {
    findings.push({
      kind: "seniority",
      token: SENIORITY[rewrittenRank],
      reason: "rewrite claims a more senior level than the source bullet",
    });
  }

  // 3. Scale words.
  for (const w of SCALE_WORDS) {
    if (rewritten.includes(w) && !source.includes(w)) {
      findings.push({ kind: "scale", token: w, reason: "unstated magnitude claim" });
    }
  }

  // 4. Tools — capitalised/technical tokens new to the rewrite must at least
  //    exist somewhere in the profile. A tool the profile never mentions cannot
  //    appear on a bullet, however plausible the posting makes it look.
  for (const token of technicalTokens(input.rewritten)) {
    const t = token.toLowerCase();
    if (source.includes(t)) continue;
    if (allowedTerms.has(t)) continue;
    findings.push({
      kind: "tool",
      token,
      reason: "tool or technology absent from the source bullet and from the profile",
    });
  }

  return findings;
}

export function isClean(input: GuardInput): boolean {
  return checkFabrication(input).length === 0;
}

function numbersIn(s: string): string[] {
  // 40%, 3.2x, 12k, 250, $1.4m — normalised so "40 %" and "40%" compare equal.
  return (s.match(/\$?\d[\d,.]*\s*(%|x|k\b|m\b|bn\b|b\b)?/g) ?? []).map((m) =>
    m.replace(/[\s,]/g, "").toLowerCase(),
  );
}

function highestRank(s: string): number {
  let rank = -1;
  SENIORITY.forEach((word, i) => {
    if (new RegExp(`\\b${word}\\b`).test(s)) rank = Math.max(rank, i);
  });
  return rank;
}

/**
 * Tokens that look like a named technology: CamelCase, dotted, hyphenated with
 * a capital, or containing +/#. Ordinary sentence-initial capitals are ignored.
 */
function technicalTokens(s: string): string[] {
  const words = s.split(/[\s,;:()[\]]+/).filter(Boolean);
  const out: string[] = [];
  words.forEach((raw, index) => {
    const w = raw.replace(/^[^A-Za-z0-9+#.]+|[^A-Za-z0-9+#.]+$/g, "");
    if (w.length < 2) return;
    const looksTechnical =
      /[A-Z].*[A-Z]/.test(w) || // AWS, GraphQL, PostgreSQL
      /[a-z][A-Z]/.test(w) || // TypeScript, JavaScript
      /^[A-Za-z]+[.+#][A-Za-z0-9+#]/.test(w) || // Node.js, C++, C#
      /^[A-Z][a-z]+[-.][A-Z]/.test(w); // React-Native
    if (!looksTechnical) return;
    if (index === 0 && !/[A-Z].*[A-Z]|[a-z][A-Z]|[.+#]/.test(w)) return;
    out.push(w);
  });
  return [...new Set(out)];
}

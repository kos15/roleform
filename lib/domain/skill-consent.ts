import type { DomainCoverageItem, DomainRequirement } from "./types";

/**
 * Skills the posting names that the member's profile does not list. PURE.
 *
 * The tailoring stage can only rephrase, reorder and requantify what the
 * profile states (CLAUDE.md §3), so a skill the profile never mentions can
 * never reach a draft on its own — the drafts lean on adjacent experience
 * instead, and the gap goes to Learning. That is correct for a skill the
 * member lacks, and a loss for one they have but never wrote down.
 *
 * These are the candidates the Résumés tab offers for the member to confirm.
 * A confirmed skill is written to the profile's Skills section by the member's
 * own action (N3 — user-authored), and the drafts are rebuilt from that
 * profile. Nothing here, and nothing a model writes, ever adds one unasked.
 *
 * Only a requirement with a canonical skill name qualifies: the confirmation
 * writes a skill to the profile, and a whole requirement sentence ("comfortable
 * with ambiguity") is not a skill anyone lists.
 */
export interface UnlistedSkill {
  skillName: string;
  necessity: DomainRequirement["necessity"];
  /** How the coverage stage judged the requirement that names it. */
  status: DomainCoverageItem["status"];
}

const NECESSITY_RANK: Record<DomainRequirement["necessity"], number> = {
  required: 0,
  preferred: 1,
  implied: 2,
};

export function unlistedSkills(
  requirements: DomainRequirement[],
  coverage: DomainCoverageItem[],
  profileSkillTerms: string[],
): UnlistedSkill[] {
  const listed = new Set(profileSkillTerms.map(normalise));
  const statusById = new Map(coverage.map((c) => [c.requirementId, c.status]));
  const bySkill = new Map<string, UnlistedSkill>();

  for (const r of requirements) {
    if (!r.skillName) continue;
    const key = normalise(r.skillName);
    if (listed.has(key)) continue;
    const status = statusById.get(r.id) ?? "absent";
    // A bullet already demonstrates it: the drafts can say so as written.
    if (status === "evidenced") continue;

    const seen = bySkill.get(key);
    if (!seen || NECESSITY_RANK[r.necessity] < NECESSITY_RANK[seen.necessity]) {
      bySkill.set(key, { skillName: r.skillName, necessity: r.necessity, status });
    }
  }

  return [...bySkill.values()].sort(
    (a, b) => NECESSITY_RANK[a.necessity] - NECESSITY_RANK[b.necessity] || a.skillName.localeCompare(b.skillName),
  );
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

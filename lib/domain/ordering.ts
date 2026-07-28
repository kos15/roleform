/**
 * Ordering rules. PURE.
 *
 * Reordering and re-weighting are legal transformations of a stated fact
 * (CLAUDE.md §3): surface the relevant, demote the rest. Nothing is deleted
 * from the profile — only omitted from a draft.
 */
import type { DomainBullet, DomainCoverageItem, DomainRequirement } from "./types";

/**
 * Relevance of a bullet to this posting: requirement weight it evidences,
 * decayed by recency. Deterministic — the same inputs always order the same way.
 */
export function rankBullets(
  bullets: DomainBullet[],
  requirements: DomainRequirement[],
  coverage: DomainCoverageItem[],
): Array<{ bullet: DomainBullet; relevance: number; requirementIds: string[] }> {
  const weightByRequirement = new Map(
    requirements.map((r) => [
      r.id,
      (r.necessity === "required" ? 3 : r.necessity === "preferred" ? 2 : 1) *
        Math.max(1, r.mentionCount),
    ]),
  );

  const hitsByBullet = new Map<string, { score: number; requirementIds: string[] }>();
  for (const item of coverage) {
    const credit = item.status === "evidenced" ? 1 : item.status === "partial" ? 0.5 : 0;
    if (credit === 0) continue;
    const w = (weightByRequirement.get(item.requirementId) ?? 1) * credit;
    for (const bulletId of item.evidenceBulletIds) {
      const cur = hitsByBullet.get(bulletId) ?? { score: 0, requirementIds: [] };
      cur.score += w;
      cur.requirementIds.push(item.requirementId);
      hitsByBullet.set(bulletId, cur);
    }
  }

  return bullets
    .map((bullet) => {
      const hit = hitsByBullet.get(bullet.id);
      const recencyFactor =
        bullet.recencyMonths === null ? 1 : Math.max(0.55, 1 - bullet.recencyMonths / 120);
      return {
        bullet,
        relevance: (hit?.score ?? 0) * recencyFactor,
        requirementIds: hit?.requirementIds ?? [],
      };
    })
    .sort((a, b) => b.relevance - a.relevance);
}

/**
 * Skills reordered to lead with the ones the posting asks for AND the profile
 * actually contains (specs F5). Never adds a skill the profile lacks.
 */
export function orderSkills(profileSkills: string[], requirements: DomainRequirement[]): string[] {
  const demand = new Map<string, number>();
  for (const r of requirements) {
    if (!r.skillName) continue;
    const key = r.skillName.toLowerCase();
    const w = r.necessity === "required" ? 3 : r.necessity === "preferred" ? 2 : 1;
    demand.set(key, (demand.get(key) ?? 0) + w * Math.max(1, r.mentionCount));
  }
  return [...profileSkills].sort((a, b) => {
    const da = demand.get(a.toLowerCase()) ?? 0;
    const db = demand.get(b.toLowerCase()) ?? 0;
    if (da !== db) return db - da;
    return a.localeCompare(b);
  });
}

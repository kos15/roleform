/**
 * The bundle builder's I/O half — RLE spec §7, rag-strategy.md §7.
 *
 * Gathers candidates and freezes bundles; the ranking itself is pure and lives
 * in `lib/domain/bundle-rank.ts`. `scripts/catalog/rebuild-bundles.ts` is the thin
 * caller. NEVER call this from a user request — that is invariant I1, and doing
 * so converts a fixed nightly cost into a per-run one.
 *
 * Candidate generation is the taxonomy join rather than a vector search: this
 * repo has no chunk corpus and no embeddings (see the script's history in
 * rag-strategy.md §5–§7). When the corpus exists, only `candidatesFor()` changes.
 * Bundles hold up to three Watch and three Read picks (bundle-rank.ts).
 */
import { db } from "@/lib/db";
import { NODES } from "@/lib/catalog/taxonomy";
import { rankAndDiversify, type Candidate } from "@/lib/domain/bundle-rank";

type Level = "intro" | "working" | "deep";

const LEVELS: Level[] = ["intro", "working", "deep"];

/** Resources below this never enter a bundle (guardrails.md, Corpus). */
const QUALITY_FLOOR = 0.35;

export async function rebuildBundles(
  skillIds?: string[],
): Promise<{ written: number; empty: number; skills: number }> {
  const allSkills = await db.skill.findMany({ select: { id: true, name: true } });
  const skillIdByName = new Map(allSkills.map((s) => [s.name, s.id]));
  // With `skillIds`, only those skills' bundles are rewritten; the child map and
  // candidate index still span the whole catalog.
  const only = skillIds ? new Set(skillIds) : null;
  const skills = only ? allSkills.filter((s) => only.has(s.id)) : allSkills;

  // Children of each node. A resource that teaches "Next.js" is legitimate
  // material for a "React" bundle at `deep` — it is not the reverse, because a
  // React tutorial does not teach Next.js.
  const childIds = new Map<string, string[]>();
  for (const node of NODES.values()) {
    if (!node.parent) continue;
    const parentId = skillIdByName.get(node.parent);
    const childId = skillIdByName.get(node.name);
    if (!parentId || !childId) continue;
    childIds.set(parentId, [...(childIds.get(parentId) ?? []), childId]);
  }

  const links = await db.courseSkill.findMany({
    include: {
      course: {
        select: {
          id: true,
          author: true,
          provider: true,
          type: true,
          qualityScore: true,
          status: true,
        },
      },
    },
  });

  // skillId → its CourseSkill rows, so the loop below is in-memory rather than
  // a query per (skill, level) pair.
  const bySkill = new Map<string, typeof links>();
  for (const link of links) {
    if (link.course.status !== "active") continue;
    bySkill.set(link.skillId, [...(bySkill.get(link.skillId) ?? []), link]);
  }

  let written = 0;
  let empty = 0;

  for (const skill of skills) {
    for (const level of LEVELS) {
      const candidates = candidatesFor(skill.id, level, bySkill, childIds.get(skill.id) ?? []);
      const ranked = rankAndDiversify(candidates);

      if (ranked.length === 0) {
        // An empty bundle is a real state, and the §9 fallback handles it. We
        // delete rather than write an empty row so a bundle that USED to have
        // material and now has none reads as absent, not as stale.
        await db.skillBundle.deleteMany({ where: { skillId: skill.id, level } });
        empty++;
        continue;
      }

      const entryPoints: Record<string, unknown> = {};
      for (const candidate of ranked) {
        entryPoints[candidate.courseId] = {
          entryLabel: candidate.entryLabel,
          entryUrl: candidate.entryUrl,
          summary: candidate.summary,
        };
      }

      const payload = {
        rankedCourseIds: ranked.map((c) => c.courseId),
        entryPoints: entryPoints as object,
        refreshedAt: new Date(),
      };

      await db.skillBundle.upsert({
        where: { skillId_level: { skillId: skill.id, level } },
        create: { skillId: skill.id, level, ...payload },
        update: payload,
      });
      written++;
    }
  }

  return { written, empty, skills: skills.length };
}

/**
 * Step 1 — candidate generation.
 *
 * The taxonomy join stands in for the hybrid search of rag-strategy.md §5. Two
 * widenings, both one hop and both penalised so they can never outrank an exact
 * match: an adjacent level, and a child skill.
 */
function candidatesFor(
  skillId: string,
  level: Level,
  bySkill: Map<string, Array<{ skillId: string; level: string; confidence: unknown; isPrimary: boolean; entryLabel: string | null; entryUrl: string | null; summary: string | null; course: { id: string; author: string | null; provider: string; type: string; qualityScore: unknown } }>>,
  children: string[],
): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();

  const consider = (
    rows: ReturnType<typeof bySkill.get>,
    hopDistance: number,
  ) => {
    for (const row of rows ?? []) {
      const distance = Math.abs(LEVELS.indexOf(level) - LEVELS.indexOf(row.level as Level));
      if (distance > 1) continue;

      const quality = Number(row.course.qualityScore);
      if (quality < QUALITY_FLOOR) continue;

      // Keep the closest tagging of a resource, never two rows for one course.
      if (seen.has(row.course.id)) continue;
      seen.add(row.course.id);

      out.push({
        courseId: row.course.id,
        author: row.course.author ?? row.course.provider,
        type: row.course.type,
        quality,
        confidence: Number(row.confidence),
        isPrimary: row.isPrimary,
        levelDistance: distance,
        hopDistance,
        entryLabel: row.entryLabel,
        entryUrl: row.entryUrl,
        summary: row.summary,
      });
    }
  };

  consider(bySkill.get(skillId), 0);
  for (const childId of children) consider(bySkill.get(childId), 1);

  return out;
}

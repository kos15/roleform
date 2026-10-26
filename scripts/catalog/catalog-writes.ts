/**
 * The catalog's database writes that take pure rows (lib/catalog/seed-rows.ts).
 * Shared by the manual seed and the deploy sync. Imports `lib/db`, never
 * `../env`: the caller decides which environment it runs in.
 */
import { db } from "../../lib/db";
import type { CourseSkillRow, SkillRow, TemplateRow } from "../../lib/catalog/seed-rows";

export async function writeTemplates(rows: TemplateRow[]): Promise<void> {
  for (const template of rows) {
    await db.template.upsert({
      where: { id: template.id },
      create: {
        id: template.id,
        name: template.name,
        kind: template.kind,
        blurb: template.blurb,
        accent: template.accent,
        structuralFlags: template.structuralFlags as unknown as object,
      },
      update: {
        name: template.name,
        kind: template.kind,
        blurb: template.blurb,
        accent: template.accent,
        structuralFlags: template.structuralFlags as unknown as object,
      },
    });
  }
}

/** Returns name → id for every skill row in the table. */
export async function writeSkills(rows: SkillRow[]): Promise<Map<string, string>> {
  // Pass 1 — every node, without its parent. Parents are set in pass 2 because
  // a child can be declared before the row its parent_id points at exists.
  for (const skill of rows) {
    await db.skill.upsert({
      where: { name: skill.name },
      create: {
        name: skill.name,
        category: skill.category,
        aliases: skill.aliases,
        slug: skill.slug,
        roadmapPath: skill.roadmapPath,
        depth: skill.depth,
        volatility: skill.volatility,
      },
      update: {
        category: skill.category,
        aliases: skill.aliases,
        slug: skill.slug,
        roadmapPath: skill.roadmapPath,
        depth: skill.depth,
        volatility: skill.volatility,
      },
    });
  }

  const skillRows = await db.skill.findMany();
  const skillIdByName = new Map(skillRows.map((s) => [s.name, s.id]));

  // Pass 2 — the tree.
  for (const skill of rows) {
    const parentId = skill.parent ? (skillIdByName.get(skill.parent) ?? null) : null;
    await db.skill.update({ where: { name: skill.name }, data: { parentId } });
  }

  return skillIdByName;
}

/**
 * The (resource, skill) join the bundle builder reads — RLE spec §3.
 *
 * `entryLabel` / `entryUrl` stay null for catalog entries, and that is honest
 * rather than pending: a timestamp we did not derive from a real transcript
 * would be a made-up number pointing into someone else's video.
 */
export async function writeCourseSkills(
  courseId: string,
  rows: CourseSkillRow[],
  skillIdByName: Map<string, string>,
): Promise<number> {
  let count = 0;
  for (const row of rows) {
    const skillId = skillIdByName.get(row.skillName)!;
    const payload = {
      level: row.level,
      confidence: row.confidence,
      isPrimary: row.isPrimary,
      summary: row.summary,
    };
    await db.courseSkill.upsert({
      where: { courseId_skillId: { courseId, skillId } },
      create: { courseId, skillId, ...payload },
      update: payload,
    });
    count++;
  }
  return count;
}

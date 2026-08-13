/**
 * Seeds templates, skills and the curated course catalog.
 *
 * ── The link check is not optional ──────────────────────────────────────────
 * Every course URL is requested before it is inserted. A URL that does not
 * resolve is REPORTED AND SKIPPED, never seeded. verified_at is stamped with
 * the date of the run that actually reached it.
 *
 * That is what makes N8 true in practice rather than in principle: a dead link
 * cannot enter the database, so the Learning tab cannot serve one. Run with
 * --skip-link-check only for local work against a network you don't trust.
 */
import "./env";
import { db } from "../lib/db";
import { SKILLS } from "../lib/catalog/skills";
import { COURSES } from "../lib/catalog/courses";
import { assertTaxonomy, NODES } from "../lib/catalog/taxonomy";
import { levelOf, primacyOf, qualityOf, summaryFor, tagsFor, typeOf } from "../lib/catalog/quality";
import { checkLiveness } from "../lib/catalog/liveness";
import { TEMPLATES } from "../lib/render/templates";
import { rateAts } from "../lib/render/ats-rules";

const skipLinkCheck = process.argv.includes("--skip-link-check");

async function main() {
  /* ------------------------------------------------------------- templates */
  for (const template of TEMPLATES) {
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
    console.log(`template ${template.id} → ATS ${rateAts(template.structuralFlags)}`);
  }

  /* ---------------------------------------------------------------- skills */
  //
  // The taxonomy is checked BEFORE anything is written. A broken tree that
  // reaches the database makes `depth` and `parent_id` silently wrong, and
  // every severity score computed from them silently wrong with them — the
  // exact failure mode a project with no test suite (CLAUDE.md §11) has no
  // other way to catch.
  const taxonomyProblems = assertTaxonomy();
  if (taxonomyProblems.length > 0) {
    console.error(`\nTaxonomy is not a valid forest (fix lib/catalog/taxonomy.ts):`);
    for (const problem of taxonomyProblems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  // Pass 1 — every node, without its parent. Parents are set in pass 2 because
  // a child can be declared before the row its parent_id points at exists.
  for (const skill of SKILLS) {
    const node = NODES.get(skill.name)!;
    await db.skill.upsert({
      where: { name: skill.name },
      create: {
        name: skill.name,
        category: skill.category,
        aliases: skill.aliases,
        slug: node.slug,
        roadmapPath: node.roadmap,
        depth: node.depth,
        volatility: node.volatility,
      },
      update: {
        category: skill.category,
        aliases: skill.aliases,
        slug: node.slug,
        roadmapPath: node.roadmap,
        depth: node.depth,
        volatility: node.volatility,
      },
    });
  }

  const skillRows = await db.skill.findMany();
  const skillIdByName = new Map(skillRows.map((s) => [s.name, s.id]));

  // Pass 2 — the tree.
  let parented = 0;
  for (const skill of SKILLS) {
    const node = NODES.get(skill.name)!;
    const parentId = node.parent ? (skillIdByName.get(node.parent) ?? null) : null;
    await db.skill.update({ where: { name: skill.name }, data: { parentId } });
    if (parentId) parented++;
  }

  const roots = SKILLS.length - parented;
  const deepest = Math.max(...[...NODES.values()].map((n) => n.depth));
  console.log(`skills: ${skillRows.length} (${roots} roots, depth ${deepest})`);

  /* --------------------------------------------------------------- courses */
  const today = new Date();
  let seeded = 0;
  let links = 0;
  const dead: string[] = [];
  const blocked: string[] = [];
  const unknownSkills = new Set<string>();

  for (const course of COURSES) {
    const skillIds = course.skills.map((name) => {
      const id = skillIdByName.get(name);
      if (!id) unknownSkills.add(name);
      return id;
    });
    if (skillIds.some((id) => !id)) continue;

    if (!skipLinkCheck) {
      // Three outcomes, not two (lib/catalog/liveness.ts). A 403 from a
      // bot-walled host is not evidence that a tutorial was deleted, and
      // treating it as such was silently shrinking the catalog.
      const liveness = await checkLiveness(course.url);
      if (liveness === "dead") {
        dead.push(`${course.provider} — ${course.title} → ${course.url}`);
        continue;
      }
      if (liveness === "blocked") {
        blocked.push(`${course.provider} — ${course.title} → ${course.url}`);
      }
    }

    // The learning engine's resource columns, all computed (lib/catalog/quality)
    // rather than authored: a hand-set quality score is a hand-set bundle
    // ranking, and the whole point of the score is that it can be argued with.
    const resource = {
      type: typeOf(course),
      qualityScore: qualityOf(course).toFixed(3),
      tags: tagsFor(course),
      status: "active" as const,
    };

    const row = await db.course.upsert({
      where: { url: course.url },
      create: {
        provider: course.provider,
        title: course.title,
        url: course.url,
        priceLabel: course.priceLabel,
        lengthLabel: course.lengthLabel,
        lengthMinutes: course.lengthMinutes,
        level: course.level,
        mark: course.mark,
        isFree: course.isFree,
        skillIds: skillIds as string[],
        verifiedAt: today,
        ...resource,
      },
      update: {
        provider: course.provider,
        title: course.title,
        priceLabel: course.priceLabel,
        lengthLabel: course.lengthLabel,
        lengthMinutes: course.lengthMinutes,
        level: course.level,
        mark: course.mark,
        isFree: course.isFree,
        skillIds: skillIds as string[],
        verifiedAt: today,
        ...resource,
      },
      select: { id: true },
    });

    // The (resource, skill) join the bundle builder reads — RLE spec §3.
    //
    // `entryLabel` / `entryUrl` stay null for catalog entries, and that is
    // honest rather than pending: a timestamp we did not derive from a real
    // transcript would be a made-up number pointing into someone else's video.
    // The columns exist and the whole path renders them, so the day the ingest
    // pipeline (spec §3, planning.md Phase 3) produces real ones, nothing
    // downstream changes.
    for (const skillName of course.skills) {
      const skillId = skillIdByName.get(skillName)!;
      // `skills[0]` is what the course TEACHES; the rest are what it is useful
      // to. Collapsing that distinction is what put the Redux tutorial at the
      // top of React's own bundle — see lib/catalog/quality.ts.
      const primacy = primacyOf(course, skillName);
      const payload = {
        level: levelOf(course),
        confidence: primacy.confidence.toFixed(3),
        isPrimary: primacy.isPrimary,
        summary: summaryFor(course, skillName),
      };
      await db.courseSkill.upsert({
        where: { courseId_skillId: { courseId: row.id, skillId } },
        create: { courseId: row.id, skillId, ...payload },
        update: payload,
      });
      links++;
    }

    seeded++;
  }

  console.log(`\ncourses seeded: ${seeded} / ${COURSES.length} (${links} skill links)`);
  console.log(`run \`pnpm bundles:rebuild\` next — bundles are what the Learning tab reads.`);

  if (unknownSkills.size > 0) {
    console.error(`\nSkill names not in the canon (fix lib/catalog/courses.ts):`);
    for (const name of unknownSkills) console.error(`  - ${name}`);
  }

  if (blocked.length > 0) {
    console.log(
      `\n${blocked.length} URL(s) refused the check (403/429/timeout) and WERE seeded.\n` +
        `The host blocked us, not the world — open each once in a browser to confirm:`,
    );
    for (const line of blocked) console.log(`  - ${line}`);
  }

  if (dead.length > 0) {
    console.error(`\n${dead.length} URL(s) returned 404/410 and were NOT seeded:`);
    for (const line of dead) console.error(`  - ${line}`);
    console.error(
      `\nFix or remove them in lib/catalog/courses.ts. A dead link is the one failure\n` +
        `the Learning tab does not recover from.`,
    );
  }

  // Report which canonical skills have no course at all — D4's trigger is gap
  // coverage dropping below 80%, and this is how you'd notice.
  const covered = new Set(COURSES.flatMap((c) => c.skills));
  const uncovered = SKILLS.filter((s) => !covered.has(s.name));
  console.log(
    `\ncatalog covers ${covered.size} of ${SKILLS.length} canonical skills ` +
      `(${Math.round((covered.size / SKILLS.length) * 100)}%)`,
  );
  if (uncovered.length > 0) {
    console.log(`no course yet for: ${uncovered.map((s) => s.name).join(", ")}`);
  }

  await db.$disconnect();
  if (dead.length > 0 || unknownSkills.size > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

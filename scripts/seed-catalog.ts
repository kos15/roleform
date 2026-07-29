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
  for (const skill of SKILLS) {
    await db.skill.upsert({
      where: { name: skill.name },
      create: { name: skill.name, category: skill.category, aliases: skill.aliases },
      update: { category: skill.category, aliases: skill.aliases },
    });
  }
  const skillRows = await db.skill.findMany();
  const skillIdByName = new Map(skillRows.map((s) => [s.name, s.id]));
  console.log(`skills: ${skillRows.length}`);

  /* --------------------------------------------------------------- courses */
  const today = new Date();
  let seeded = 0;
  const dead: string[] = [];
  const unknownSkills = new Set<string>();

  for (const course of COURSES) {
    const skillIds = course.skills.map((name) => {
      const id = skillIdByName.get(name);
      if (!id) unknownSkills.add(name);
      return id;
    });
    if (skillIds.some((id) => !id)) continue;

    if (!skipLinkCheck) {
      const alive = await urlResolves(course.url);
      if (!alive) {
        dead.push(`${course.provider} — ${course.title} → ${course.url}`);
        continue;
      }
    }

    await db.course.upsert({
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
      },
    });
    seeded++;
  }

  console.log(`\ncourses seeded: ${seeded} / ${COURSES.length}`);

  if (unknownSkills.size > 0) {
    console.error(`\nSkill names not in the canon (fix lib/catalog/courses.ts):`);
    for (const name of unknownSkills) console.error(`  - ${name}`);
  }

  if (dead.length > 0) {
    console.error(`\n${dead.length} URL(s) did not resolve and were NOT seeded:`);
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

async function urlResolves(url: string): Promise<boolean> {
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const response = await fetch(url, {
        method,
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
        headers: { "User-Agent": "Roleform-catalog-check/1.0" },
      });
      if (response.ok) return true;
      // Some hosts reject HEAD but serve GET fine.
      if (method === "HEAD" && (response.status === 403 || response.status === 405)) continue;
      return false;
    } catch {
      if (method === "GET") return false;
    }
  }
  return false;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

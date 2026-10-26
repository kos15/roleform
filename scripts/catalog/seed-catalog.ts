/**
 * Seeds templates, skills and the curated course catalog.
 *
 * ── The link check is not optional ──────────────────────────────────────────
 * Every course URL is requested before it is inserted. A URL that does not
 * resolve is REPORTED AND SKIPPED, never seeded. verified_at is stamped with
 * the date of the run that actually reached it. checked_at (the TTL stamp the
 * daily re-check reads, N24) is staggered over 7 days by row index, so a
 * re-seed never makes the whole catalog due on the same day.
 *
 * The seed refuses to run while `catalogProblems` reports anything.
 *
 * That is what makes N8 true in practice rather than in principle: a dead link
 * cannot enter the database, so the Learning tab cannot serve one. Run with
 * --skip-link-check only for local work against a network you don't trust:
 * local-only — production builds never pass it (N25). It stamps no verified_at
 * on an existing row and creates new rows already due for the daily re-check.
 * Rows come from the pure lib/catalog/seed-rows.ts, the same source the deploy
 * sync writes from.
 */
import "../env";
import { db } from "../../lib/db";
import { SKILLS } from "../../lib/catalog/skills";
import { COURSES } from "../../lib/catalog/courses";
import { catalogSeedRows } from "../../lib/catalog/seed-rows";
import { writeCourseSkills, writeSkills, writeTemplates } from "./catalog-writes";
import { catalogProblems } from "../../lib/catalog/problems";
import { CATALOG_TTL_DAYS, daysBefore, seededStatus, staggeredCheckedAt, stampsVerifiedAt } from "../../lib/domain/catalog-refresh";
import { assertTaxonomy } from "../../lib/catalog/taxonomy";
import { checkCourseLink, type Liveness } from "../../lib/catalog/liveness";
import { assertTemplates } from "../../lib/render/templates";
import { rateAts } from "../../lib/render/ats-rules";

const skipLinkCheck = process.argv.includes("--skip-link-check");

async function main() {
  const problems = catalogProblems(COURSES, SKILLS.map((s) => s.name));
  if (problems.length > 0) {
    console.error("Catalog has problems (pnpm check:catalog):");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  /* ------------------------------------------------------------- templates */
  //
  // The rating is computed (N5), but `atsWhy` is prose beside it, and prose
  // drifts. A template whose sentence claims one violation under a Low badge
  // has told the user two different things. Checked before anything is written.
  const templateProblems = assertTemplates();
  if (templateProblems.length > 0) {
    console.error("Template definitions are inconsistent:");
    for (const problem of templateProblems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  const rows = catalogSeedRows();

  await writeTemplates(rows.templates);
  for (const row of rows.templates) {
    console.log(`template ${row.id} → ATS ${rateAts(row.structuralFlags)}`);
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

  const skillIdByName = await writeSkills(rows.skills);

  const roots = rows.skills.filter((s) => !s.parent).length;
  const deepest = Math.max(...rows.skills.map((s) => s.depth));
  console.log(`skills: ${skillIdByName.size} (${roots} roots, depth ${deepest})`);

  /* --------------------------------------------------------------- courses */
  const today = new Date();
  let seeded = 0;
  let links = 0;
  const dead: string[] = [];
  const blocked: string[] = [];
  const unknownSkills = new Set<string>();

  const skillRowsByUrl = new Map<string, typeof rows.courseSkills>();
  for (const row of rows.courseSkills) {
    const list = skillRowsByUrl.get(row.courseUrl);
    if (list) list.push(row);
    else skillRowsByUrl.set(row.courseUrl, [row]);
  }

  for (const [index, course] of rows.courses.entries()) {
    const { url, skills, ...written } = course;
    const skillIds = skills.map((name) => {
      const id = skillIdByName.get(name);
      if (!id) unknownSkills.add(name);
      return id;
    });
    if (skillIds.some((id) => !id)) continue;

    let verdict: Liveness | null = null;
    if (!skipLinkCheck) {
      // Three outcomes, not two (lib/catalog/liveness.ts). A 403 from a
      // bot-walled host is not evidence that a tutorial was deleted, and
      // treating it as such was silently shrinking the catalog.
      const { liveness } = await checkCourseLink({ url, type: course.type });
      verdict = liveness;
      if (liveness === "dead") {
        dead.push(`${course.provider} — ${course.title} → ${url}`);
        continue;
      }
      if (liveness === "blocked") {
        blocked.push(`${course.provider} — ${course.title} → ${url}`);
      }
    }

    // checked_at/status: a link-checked run stamps the staggered TTL (we did
    // check) and revives an existing row only on a "live" verdict (seededStatus:
    // a blocked check must not undo the cron's dead verdict). --skip-link-check
    // proved nothing, so a new row is created already due and an existing row
    // keeps whatever the re-check last wrote.
    // Create: a new row is a curator's addition, so live or blocked starts it
    // active (seededStatus(verdict, true)); unchecked, it is created already due.
    // A live re-seed also returns quarantined/stale rows to active (recorded decision).
    const createChecked =
      verdict === null
        ? { status: "active" as const, checkedAt: daysBefore(today, CATALOG_TTL_DAYS) }
        : {
            status: seededStatus(verdict, true) ?? ("active" as const),
            checkedAt: staggeredCheckedAt(today, index),
          };
    const updateChecked =
      verdict === null
        ? {}
        : {
            checkedAt: staggeredCheckedAt(today, index),
            ...(seededStatus(verdict, false) === "active" ? { status: "active" as const } : {}),
          };

    // An existing row's verified_at moves only when this run reached the URL and
    // it answered (stampsVerifiedAt); --skip-link-check and a blocked host prove nothing.
    const updateVerified = stampsVerifiedAt(verdict, false) ? { verifiedAt: today } : {};

    const row = await db.course.upsert({
      where: { url },
      create: {
        url,
        ...written,
        skillIds: skillIds as string[],
        verifiedAt: today,
        ...createChecked,
      },
      update: {
        ...written,
        skillIds: skillIds as string[],
        ...updateVerified,
        ...updateChecked,
      },
      select: { id: true },
    });

    links += await writeCourseSkills(row.id, skillRowsByUrl.get(url) ?? [], skillIdByName);

    seeded++;
  }

  console.log(`\ncourses seeded: ${seeded} / ${rows.courses.length} (${links} skill links)`);
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
  const covered = new Set(rows.courses.flatMap((c) => c.skills));
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

/**
 * The manual full sweep of the catalog; the daily `/api/cron/catalog` re-checks due rows (N24).
 *
 * Requests every URL already in the `courses` table and flags dead links and
 * stale verified_at dates.
 *
 * Refreshes verified_at for links that still resolve, so the staleness column
 * means something.
 *
 *   pnpm check:links
 */
import "../env";
import { db } from "../../lib/db";
import { NODES, roadmapUrl } from "../../lib/catalog/taxonomy";
import { checkCourseLink } from "../../lib/catalog/liveness";
import { nextStatus } from "../../lib/domain/catalog-refresh";

const STALE_DAYS = 120;

async function main() {
  const rows = await db.course.findMany();
  const today = new Date();
  const dead: typeof rows = [];
  const stale: typeof rows = [];

  console.log(`Checking ${rows.length} catalog links\n`);

  const blocked: typeof rows = [];

  for (const course of rows) {
    const { liveness } = await checkCourseLink({ url: course.url, type: course.type });
    const alive = liveness !== "dead";
    if (liveness === "blocked") blocked.push(course);
    const ageDays = Math.floor(
      (Date.now() - course.verifiedAt.getTime()) / 86_400_000,
    );

    if (!alive) {
      dead.push(course);
      // OUT-7: excluded from bundles immediately, without waiting for a
      // rebuild. Only an active row flips (one way: never writes active); a
      // dead verdict on a quarantined or already-dead row is counted, not written.
      const flip = course.status === "active" && nextStatus("active", liveness) === "dead";
      await db.course.update({
        where: { id: course.id },
        data: flip ? { checkedAt: today, status: "dead" } : { checkedAt: today },
      });
      console.log(`DEAD   ${course.provider} — ${course.title}\n       ${course.url}`);
      continue;
    }
    if (liveness === "blocked") {
      console.log(`BLOCKED ${course.provider} — ${course.title} (host refused the check)`);
    }

    await db.course.update({ where: { id: course.id }, data: { verifiedAt: today, checkedAt: today } });
    if (ageDays > STALE_DAYS) {
      stale.push(course);
      console.log(`STALE  ${course.title} (last verified ${ageDays} days ago, now refreshed)`);
    }
  }

  console.log(
    `\nalive: ${rows.length - dead.length - blocked.length}  blocked: ${blocked.length}  ` +
      `dead: ${dead.length}  was stale: ${stale.length}`,
  );
  if (blocked.length > 0) {
    console.log(`blocked hosts refused US, not the world — they stay active. Spot-check in a browser.`);
  }

  /* ------------------------------------------------- roadmap.sh fallbacks */
  //
  // RLE spec §9: when the corpus has nothing, the ONLY thing we serve is the
  // roadmap.sh node link. That makes these URLs load-bearing in exactly the way
  // a course URL is — a dead one is a 404 in front of someone job-hunting — so
  // they are swept by the same check rather than trusted because they are
  // "just" a fallback.
  const roadmapUrls = new Map<string, string>();
  for (const node of NODES.values()) {
    const url = roadmapUrl(node.name);
    if (url) roadmapUrls.set(url, node.name);
  }

  const deadRoadmaps: string[] = [];
  console.log(`\nChecking ${roadmapUrls.size} roadmap.sh fallback targets\n`);
  for (const [url, name] of roadmapUrls) {
    if ((await checkCourseLink({ url, type: "roadmap" })).liveness === "dead") {
      deadRoadmaps.push(`${name} → ${url}`);
      console.log(`DEAD   ${name}\n       ${url}`);
    }
  }
  if (deadRoadmaps.length > 0) {
    console.error(
      `\n${deadRoadmaps.length} roadmap target(s) did not resolve. Set \`roadmap: null\` for these\n` +
        `in lib/catalog/taxonomy.ts — no fallback is better than a broken one — then re-seed.`,
    );
  } else {
    console.log(`all ${roadmapUrls.size} roadmap targets resolve`);
  }

  if (dead.length > 0) {
    console.error(
      `\n${dead.length} course(s) came back dead. Rows that were active are now marked dead and are no longer served;\n` +
        `rows found dead that were already non-active are unchanged.\n` +
        `Fix or remove them in lib/catalog/courses.ts, then re-run pnpm seed:catalog:\n`,
    );
    for (const course of dead) console.error(`  - ${course.provider} — ${course.title} → ${course.url}`);
  }

  await db.$disconnect();
  process.exit(dead.length === 0 && deadRoadmaps.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

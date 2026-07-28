/**
 * M7.10 — quarterly catalog link check.
 *
 * Requests every URL already in the `courses` table and flags dead links and
 * stale verified_at dates. Manual run, on purpose: this is an accepted
 * maintenance cost (F8), not a cron job pretending the problem is solved.
 *
 * Refreshes verified_at for links that still resolve, so the staleness column
 * means something.
 *
 *   pnpm check:links
 */
import "./env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";

const STALE_DAYS = 120;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const client = postgres(url, { max: 4 });
  const db = drizzle(client, { schema });

  const rows = await db.select().from(schema.courses);
  const today = new Date().toISOString().slice(0, 10);
  const dead: typeof rows = [];
  const stale: typeof rows = [];

  console.log(`Checking ${rows.length} catalog links\n`);

  for (const course of rows) {
    const alive = await urlResolves(course.url);
    const ageDays = Math.floor(
      (Date.now() - new Date(course.verifiedAt).getTime()) / 86_400_000,
    );

    if (!alive) {
      dead.push(course);
      console.log(`DEAD   ${course.provider} — ${course.title}\n       ${course.url}`);
      continue;
    }

    await db.update(schema.courses).set({ verifiedAt: today }).where(eq(schema.courses.id, course.id));
    if (ageDays > STALE_DAYS) {
      stale.push(course);
      console.log(`STALE  ${course.title} (last verified ${ageDays} days ago, now refreshed)`);
    }
  }

  console.log(`\nalive: ${rows.length - dead.length}  dead: ${dead.length}  was stale: ${stale.length}`);

  if (dead.length > 0) {
    console.error(
      `\nRemove or replace these in lib/catalog/courses.ts, then re-run pnpm seed:catalog.\n` +
        `Until then they are still being served — delete them from the table if that matters today:\n`,
    );
    for (const course of dead) console.error(`  delete from courses where url = '${course.url}';`);
  }

  await client.end();
  process.exit(dead.length === 0 ? 0 : 1);
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

/**
 * The deploy-time catalog sync's I/O half (N25): Prisma store, advisory lock,
 * wiring. Imports `lib/db` statically, so it is reached only through the gated
 * dynamic import in `catalog.ts`. Never imports `../env`, and takes
 * `rebuildBundles` / `checkCourseLink` from `lib/` rather than the scripts that
 * load .env.local.
 */
import postgres from "postgres";
import { db } from "../../lib/db";
import { checkCourseLink } from "../../lib/catalog/liveness";
import { catalogSeedRows } from "../../lib/catalog/seed-rows";
import { rebuildBundles } from "../../lib/services/learning/rebuild-bundles";
import { writeCourseSkills, writeSkills, writeTemplates } from "../catalog/catalog-writes";
import { SYNC_LOCK_KEY, syncCatalog, type CatalogStore } from "./catalog-sync";

/**
 * A session advisory lock on its own connection. DATABASE_URL is the pgbouncer
 * transaction pooler, where a session lock can leak or unlock on another
 * backend, so this never goes through Prisma.
 */
export function advisoryLock(directUrl: string | undefined): () => Promise<() => Promise<void>> {
  return async () => {
    if (!directUrl) {
      throw new Error("DIRECT_URL is not set — the catalog lock needs a session connection, not the pgbouncer pooler");
    }
    // max_lifetime: null — postgres.js must never recycle this connection, or the session lock drops mid-run.
    const sql = postgres(directUrl, { max: 1, max_lifetime: null });
    try {
      await sql`select pg_advisory_lock(hashtext(${SYNC_LOCK_KEY}))`;
    } catch (e) {
      await sql.end();
      throw e;
    }
    return async () => {
      try {
        await sql`select pg_advisory_unlock(hashtext(${SYNC_LOCK_KEY}))`;
      } catch (e) {
        // The lock dies with the session, so a failed unlock must not fail the deploy or mask its error.
        console.error(`[deploy:catalog] lock release failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        await sql.end();
      }
    };
  };
}

export const prismaCatalogStore: CatalogStore = {
  async lastHash() {
    const row = await db.catalogSync.findFirst({ orderBy: { syncedAt: "desc" }, select: { hash: true } });
    return row?.hash ?? null;
  },
  async existingUrls() {
    const rows = await db.course.findMany({ select: { url: true } });
    return new Set(rows.map((r) => r.url));
  },
  writeTemplates,
  writeSkills,
  async createCourse(data) {
    const row = await db.course.create({ data, select: { id: true } });
    return row.id;
  },
  async updateCourse(url, data) {
    const row = await db.course.update({ where: { url }, data, select: { id: true } });
    return row.id;
  },
  writeCourseSkills,
  async record(sync) {
    await db.catalogSync.create({ data: sync });
  },
};

export async function runCatalogDeploy(env: Partial<NodeJS.ProcessEnv> = process.env): Promise<number> {
  try {
    const outcome = await syncCatalog({
      rows: catalogSeedRows(),
      store: prismaCatalogStore,
      lock: advisoryLock(env.DIRECT_URL),
      check: (def) => checkCourseLink(def),
      rebuild: () => rebuildBundles(),
      today: new Date(),
      clock: Date.now,
      gitSha: env.VERCEL_GIT_COMMIT_SHA ?? null,
    });
    return outcome.kind === "gated" || outcome.kind === "dead" ? 1 : 0;
  } finally {
    await db.$disconnect();
  }
}

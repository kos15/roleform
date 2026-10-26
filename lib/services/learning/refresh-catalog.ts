/**
 * The daily catalog link re-check's I/O half (N24, F8).
 *
 * Re-checks active courses whose 7-day TTL has lapsed. A conclusive dead
 * verdict flips `active → dead`, one way; blocked and live leave a row active.
 * Bundles are rebuilt only when a bundle could be naming a non-active course.
 *
 * NEVER call this from a user request: it shares the I1 reasoning in
 * `rebuild-bundles.ts` — request-time work is billed on every run forever.
 * No model call here (N12/N13); logs carry counts only (N7).
 *
 * The seams (`check`, `store`, `rebuild`, `clock`) are injected so the logic is
 * tested against an in-memory store; `prismaRefreshStore` is a thin adapter.
 */
import "server-only";
import { db } from "@/lib/db";
import { checkCourseLink, type LinkCheck } from "@/lib/catalog/liveness";
import type { ResourceType } from "@/lib/catalog/quality";
import { CATALOG_TTL_DAYS, OVERDUE_DAYS, daysBefore, nextStatus } from "@/lib/domain/catalog-refresh";
import { rebuildBundles } from "./rebuild-bundles";

/** One due course: the link-check input plus the row's id and TTL stamp. */
export interface DueCourse {
  id: string;
  url: string;
  type: ResourceType;
  checkedAt: Date;
}

export interface RefreshStore {
  due(cutoff: Date, limit: number): Promise<DueCourse[]>;
  claim(id: string, cutoff: Date, now: Date): Promise<boolean>;
  markDead(id: string): Promise<void>;
  bundlesNamingNonActive(): Promise<number>;
  countOverdue(cutoff: Date): Promise<number>;
}

export const prismaRefreshStore: RefreshStore = {
  async due(cutoff, limit) {
    return db.course.findMany({
      where: { status: "active", checkedAt: { lte: cutoff } },
      orderBy: { checkedAt: "asc" },
      take: limit,
      select: { id: true, url: true, type: true, checkedAt: true },
    });
  },
  // Compare-and-set on `≤ cutoff`, never equality: Postgres keeps microseconds,
  // a JS Date does not. The first claimer moves checkedAt to `now`, after which
  // the row no longer matches. `status: "active"` refuses a row quarantined mid-run.
  async claim(id, cutoff, now) {
    const res = await db.course.updateMany({
      where: { id, status: "active", checkedAt: { lte: cutoff } },
      data: { checkedAt: now },
    });
    return res.count === 1;
  },
  async markDead(id) {
    await db.course.updateMany({ where: { id, status: "active" }, data: { status: "dead" } });
  },
  async bundlesNamingNonActive() {
    const gone = await db.course.findMany({ where: { status: { not: "active" } }, select: { id: true } });
    if (gone.length === 0) return 0;
    return db.skillBundle.count({ where: { rankedCourseIds: { hasSome: gone.map((c) => c.id) } } });
  },
  async countOverdue(cutoff) {
    return db.course.count({ where: { status: "active", checkedAt: { lt: cutoff } } });
  },
};

export interface RefreshSummary {
  due: number;
  checked: number;
  dead: number;
  blocked: number;
  skipped: number;
  overdue30: number;
  rebuilt: "yes" | "no" | "failed";
}

export const CONCURRENCY = 5;

export async function refreshDueLinks(opts: {
  /** Epoch ms; no new claim at or after it. */
  claimUntil: number;
  limit?: number;
  now?: Date;
  check?: (def: Parameters<typeof checkCourseLink>[0]) => Promise<LinkCheck>;
  store?: RefreshStore;
  rebuild?: () => Promise<unknown>;
  clock?: () => number;
}): Promise<RefreshSummary> {
  const limit = opts.limit ?? 150;
  const now = opts.now ?? new Date();
  const check = opts.check ?? ((def) => checkCourseLink(def));
  const store = opts.store ?? prismaRefreshStore;
  const rebuild = opts.rebuild ?? (() => rebuildBundles());
  const clock = opts.clock ?? Date.now;

  const cutoff = daysBefore(now, CATALOG_TTL_DAYS);
  const rows = await store.due(cutoff, limit);

  let checked = 0;
  let dead = 0;
  let blocked = 0;
  let skipped = 0;
  let next = 0;

  const worker = async () => {
    while (next < rows.length) {
      const course = rows[next++];
      if (clock() >= opts.claimUntil) return;
      if (!(await store.claim(course.id, cutoff, now))) {
        skipped++;
        continue;
      }
      checked++;
      const { url, type } = course;
      const verdict = (
        await check({ url, type }).catch(
          (): LinkCheck => ({ liveness: "blocked", authorName: null }),
        )
      ).liveness;
      if (nextStatus("active", verdict) === "dead") {
        await store.markDead(course.id);
        dead++;
      } else if (verdict === "blocked") {
        blocked++;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const needs = dead > 0 || (await store.bundlesNamingNonActive()) > 0;
  let rebuilt: RefreshSummary["rebuilt"] = "no";
  if (needs) {
    try {
      await rebuild();
      rebuilt = "yes";
    } catch {
      rebuilt = "failed";
    }
  }

  const overdue30 = await store.countOverdue(daysBefore(now, OVERDUE_DAYS));

  console.log(
    `[cron:catalog] due=${rows.length} checked=${checked} dead=${dead} blocked=${blocked} skipped=${skipped} overdue30=${overdue30} rebuilt=${rebuilt}`,
  );
  return { due: rows.length, checked, dead, blocked, skipped, overdue30, rebuilt };
}

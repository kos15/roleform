import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sourceOf } from "../../structure/files";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/services/learning/rebuild-bundles", () => ({ rebuildBundles: vi.fn() }));

import {
  CONCURRENCY,
  refreshDueLinks,
  type DueCourse,
  type RefreshStore,
} from "@/lib/services/learning/refresh-catalog";

const now = new Date("2026-10-26T03:17:00.000Z");
const DAY = 86_400_000;
const cutoff = new Date("2026-10-19T03:17:00.000Z");

const row = (id: string, daysOld: number): DueCourse => ({
  id,
  url: `https://example.test/${id}`,
  type: "doc",
  checkedAt: new Date(now.getTime() - daysOld * DAY),
});

function makeStore(
  rows: DueCourse[],
  { lose = new Set<string>(), nonActiveBundles = 0, overdue = 0 } = {},
) {
  return {
    due: vi.fn(async () => rows),
    claim: vi.fn(async (id: string) => !lose.has(id)),
    markDead: vi.fn(async () => {}),
    bundlesNamingNonActive: vi.fn(async () => nonActiveBundles),
    countOverdue: vi.fn(async () => overdue),
  } satisfies RefreshStore;
}

const live = async () => ({ liveness: "live" as const, authorName: null });
const verdict = (map: Record<string, "live" | "dead" | "blocked">) =>
  vi.fn(async (def: { url: string }) => ({
    liveness: map[def.url.split("/").pop()!] ?? "live",
    authorName: null,
  }));

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  log = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const base = () => ({ claimUntil: Infinity, now, check: live, rebuild: vi.fn(async () => ({})) });

describe("refreshDueLinks", () => {
  it("T1 asks the store for rows past the 7-day cutoff, limit 150 by default", async () => {
    const store = makeStore([]);
    await refreshDueLinks({ ...base(), store });
    expect(store.due).toHaveBeenCalledWith(cutoff, 150);
    await refreshDueLinks({ ...base(), store, limit: 20 });
    expect(store.due).toHaveBeenLastCalledWith(cutoff, 20);
  });

  it("T2 checks only the rows it wins the claim on", async () => {
    const store = makeStore([row("a", 8), row("b", 9), row("c", 10)], { lose: new Set(["b"]) });
    const check = vi.fn(async (_def: { url: string }) => ({ liveness: "live" as const, authorName: null }));
    const s = await refreshDueLinks({ ...base(), store, check });
    expect(store.claim).toHaveBeenCalledWith("a", cutoff, now);
    expect(check.mock.calls.map((c) => c[0].url).sort()).toEqual([
      "https://example.test/a",
      "https://example.test/c",
    ]);
    expect(s).toMatchObject({ due: 3, checked: 2, skipped: 1 });
  });

  it("T3 a dead verdict marks dead and rebuilds once with no argument", async () => {
    const store = makeStore([row("a", 8)]);
    const b = base();
    const s = await refreshDueLinks({ ...b, store, check: verdict({ a: "dead" }) });
    expect(store.markDead).toHaveBeenCalledWith("a");
    expect(b.rebuild).toHaveBeenCalledTimes(1);
    expect(b.rebuild).toHaveBeenCalledWith();
    expect(s).toMatchObject({ dead: 1, rebuilt: "yes" });
  });

  it("T4 blocked stays active", async () => {
    const store = makeStore([row("a", 8), row("b", 8)]);
    const s = await refreshDueLinks({ ...base(), store, check: verdict({ a: "blocked", b: "live" }) });
    expect(s).toMatchObject({ blocked: 1, dead: 0 });
    expect(store.markDead).not.toHaveBeenCalled();
  });

  it("T5 nothing dead and no stale bundles: no rebuild", async () => {
    const store = makeStore([row("a", 8)]);
    const b = base();
    const s = await refreshDueLinks({ ...b, store });
    expect(b.rebuild).not.toHaveBeenCalled();
    expect(s.rebuilt).toBe("no");
  });

  it("T6 a bundle naming a non-active course triggers a rebuild", async () => {
    const store = makeStore([row("a", 8)], { nonActiveBundles: 2 });
    const b = base();
    const s = await refreshDueLinks({ ...b, store });
    expect(b.rebuild).toHaveBeenCalledTimes(1);
    expect(s.rebuilt).toBe("yes");
  });

  it("T7 a failed rebuild is reported, never thrown", async () => {
    const store = makeStore([row("a", 8)]);
    const s = await refreshDueLinks({
      ...base(),
      store,
      check: verdict({ a: "dead" }),
      rebuild: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    expect(s).toMatchObject({ dead: 1, rebuilt: "failed" });
    expect(store.markDead).toHaveBeenCalledWith("a");
  });

  it("T8 stops claiming once the clock reaches claimUntil", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`r${i}`, 8));
    const store = makeStore(rows);
    const ticks = [0, 0, 0];
    const clock = vi.fn(() => (ticks.length ? ticks.shift()! : 1000));
    const s = await refreshDueLinks({ ...base(), store, clock, claimUntil: 1000 });
    expect(store.claim).toHaveBeenCalledTimes(3);
    expect(s).toMatchObject({ checked: 3, due: 10 });
  });

  it("T9 runs at most CONCURRENCY checks at once", async () => {
    expect(CONCURRENCY).toBe(5);
    const rows = Array.from({ length: 12 }, (_, i) => row(`r${i}`, 8));
    const store = makeStore(rows);
    let inflight = 0;
    let max = 0;
    const check = async () => {
      inflight++;
      max = Math.max(max, inflight);
      await new Promise((r) => setTimeout(r, 0));
      inflight--;
      return { liveness: "live" as const, authorName: null };
    };
    const s = await refreshDueLinks({ ...base(), store, check });
    expect(max).toBe(5);
    expect(s.checked).toBe(12);
  });

  it("T10 a throwing check counts as blocked", async () => {
    const store = makeStore([row("a", 8)]);
    const s = await refreshDueLinks({
      ...base(),
      store,
      check: vi.fn(async () => {
        throw new Error("net");
      }),
    });
    expect(s).toMatchObject({ blocked: 1, dead: 0 });
    expect(store.markDead).not.toHaveBeenCalled();
  });

  it("T11 counts rows overdue by 30 days", async () => {
    const store = makeStore([], { overdue: 4 });
    const s = await refreshDueLinks({ ...base(), store });
    expect(store.countOverdue).toHaveBeenCalledWith(new Date("2026-09-26T03:17:00.000Z"));
    expect(s.overdue30).toBe(4);
  });

  it("T12 returns the summary and logs one counts-only line", async () => {
    const store = makeStore([row("a", 8), row("b", 8)], { lose: new Set(["b"]), overdue: 4 });
    const s = await refreshDueLinks({ ...base(), store, check: verdict({ a: "dead" }) });
    expect(s).toEqual({ due: 2, checked: 1, dead: 1, blocked: 0, skipped: 1, overdue30: 4, rebuilt: "yes" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "[cron:catalog] due=2 checked=1 dead=1 blocked=0 skipped=1 overdue30=4 rebuilt=yes",
    );
  });

  it("T13 the Prisma adapter writes only checkedAt and status", () => {
    const src = sourceOf("lib/services/learning/refresh-catalog.ts");
    const guard = /\burl:\s*[^ts\s]/;
    expect('data: { url: "x" }').toMatch(guard);
    expect("url: true").not.toMatch(guard);
    expect("url: string").not.toMatch(guard);
    expect(src).not.toMatch(/verifiedAt|["']stale["']|\btitle:|\bauthor:|\bdocKind:|\burl:\s*[^ts\s]/);
    expect(src).toContain("data: { checkedAt: now }");
    expect(src).toContain('data: { status: "dead" }');
  });
});

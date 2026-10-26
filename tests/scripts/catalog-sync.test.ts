import { describe, expect, it, vi } from "vitest";
import { setTimeout as sleep } from "node:timers/promises";
import { catalogHash, catalogSeedRows, type CatalogSeedRows } from "@/lib/catalog/seed-rows";
import type { LinkCheck } from "@/lib/catalog/liveness";
import { catalogGateProblems, syncCatalog, type CatalogStore, type SyncDeps } from "@/scripts/deploy/catalog-sync";

const base = catalogSeedRows();
const url = (n: number) => `https://a.test/${n}`;

function rowsWith(urls: string[]): CatalogSeedRows {
  return {
    templates: [base.templates[0]],
    skills: base.skills.filter((s) => s.name === "HTML" || s.name === "CSS"),
    courses: urls.map((u) => ({ ...base.courses[0], url: u, skills: ["HTML"] })),
    courseSkills: urls.map((u) => ({ ...base.courseSkills[0], courseUrl: u, skillName: "HTML" })),
  };
}

const today = new Date("2026-10-26T00:00:00.000Z");
const live: LinkCheck = { liveness: "live", authorName: null };

function setup(opts: { last?: string | null; existing?: string[]; urls?: string[]; written?: number } = {}) {
  const calls: string[] = [];
  const track = <A extends unknown[], R>(name: string, fn: (...a: A) => R) =>
    vi.fn((...a: A) => {
      calls.push(name);
      return fn(...a);
    });
  const store = {
    lastHash: track("lastHash", async () => opts.last ?? null),
    existingUrls: track("existingUrls", async () => new Set(opts.existing ?? [])),
    writeTemplates: track("writeTemplates", async () => {}),
    writeSkills: track("writeSkills", async () => new Map([["HTML", "s1"], ["CSS", "s2"]])),
    createCourse: track("createCourse", async (d: { url: string }) => "id-" + d.url),
    updateCourse: track("updateCourse", async (u: string, _data: unknown) => "id-" + u),
    writeCourseSkills: track("writeCourseSkills", async (_id: string, rows: unknown[]) => rows.length),
    record: track("record", async () => {}),
  };
  const lock = vi.fn(async () => {
    calls.push("lock");
    return async () => {
      calls.push("release");
    };
  });
  const rows = rowsWith(opts.urls ?? [url(1)]);
  const ticks = [1000, 1450];
  const deps = {
    rows,
    store: store as unknown as CatalogStore,
    lock,
    check: vi.fn(async (_def: { url: string; type: string }): Promise<LinkCheck> => live),
    rebuild: track("rebuild", async () => ({ written: opts.written ?? 7 })),
    gates: () => [] as string[],
    today,
    clock: () => ticks.shift() ?? 1450,
    gitSha: "abc",
    log: vi.fn(),
    error: vi.fn(),
  };
  return { calls, store, lock, rows, deps: deps as typeof deps & SyncDeps };
}

describe("syncCatalog", () => {
  it("S1 gate problems stop before the lock and the store", async () => {
    const t = setup();
    const out = await syncCatalog({ ...t.deps, gates: () => ["x"] });
    expect(out).toEqual({ kind: "gated", problems: ["x"] });
    expect(t.lock).not.toHaveBeenCalled();
    for (const fn of Object.values(t.store)) expect(fn).not.toHaveBeenCalled();
  });

  it("S2 unchanged hash does nothing", async () => {
    const t = setup();
    const hash = catalogHash(t.rows);
    const t2 = setup({ last: hash });
    const out = await syncCatalog(t2.deps);
    expect(out).toEqual({ kind: "unchanged", hash });
    expect(t2.deps.log).toHaveBeenCalledWith(`[deploy:catalog] unchanged ${hash.slice(0, 8)}`);
    expect(t2.calls).toEqual(["lock", "lastHash", "release"]);
  });

  it("S3 only new URLs are checked", async () => {
    const t = setup({ existing: [url(1)], urls: [url(1), url(2), url(3)] });
    await syncCatalog(t.deps);
    expect(t.deps.check.mock.calls.map((c) => (c as unknown as [{ url: string }])[0].url).sort()).toEqual([url(2), url(3)]);
    expect(t.store.updateCourse.mock.calls[0][0]).toBe(url(1));
    expect(t.store.createCourse).toHaveBeenCalledTimes(2);
  });

  it("S4 a dead new URL writes nothing", async () => {
    const t = setup({ urls: [url(1), url(2)] });
    t.deps.check.mockImplementation(async (def: { url: string; type: string }): Promise<LinkCheck> => ({ liveness: def.url === url(2) ? "dead" : "live", authorName: null }));
    const out = await syncCatalog(t.deps);
    expect(out.kind).toBe("dead");
    if (out.kind === "dead") expect(out.dead[0]).toContain(url(2));
    expect(t.calls).toEqual(["lock", "lastHash", "existingUrls", "release"]);
    expect(t.store.record).not.toHaveBeenCalled();
  });

  it("S5 blocked or thrown is seeded", async () => {
    const t = setup({ urls: [url(1), url(2)] });
    t.deps.check.mockImplementation(async (def: { url: string; type: string }): Promise<LinkCheck> => {
      if (def.url === url(2)) throw new Error("boom");
      return { liveness: "blocked", authorName: null };
    });
    const out = await syncCatalog(t.deps);
    expect(out.kind).toBe("synced");
    if (out.kind === "synced") expect(out.blocked).toHaveLength(2);
  });

  it("S6 new-row stamps; existing rows carry no stamps", async () => {
    const t = setup({ existing: [url(1)], urls: [url(1), url(2), url(3), url(4)] });
    await syncCatalog(t.deps);
    const created = t.store.createCourse.mock.calls.find((c) => c[0].url === url(4))![0];
    expect(created).toMatchObject({ status: "active", verifiedAt: today, checkedAt: new Date("2026-10-23T00:00:00.000Z"), skillIds: ["s1"] });
    const data = t.store.updateCourse.mock.calls[0][1] as unknown as Record<string, unknown>;
    for (const k of ["status", "checkedAt", "verifiedAt", "url"]) expect(Object.keys(data)).not.toContain(k);
  });

  it("S7 write order", async () => {
    const t = setup();
    await syncCatalog(t.deps);
    expect(t.calls).toEqual(["lock", "lastHash", "existingUrls", "writeTemplates", "writeSkills", "createCourse", "writeCourseSkills", "rebuild", "record", "release"]);
  });

  it("S8 record", async () => {
    const t = setup({ written: 7 });
    await syncCatalog(t.deps);
    expect(t.store.record).toHaveBeenCalledWith({ hash: catalogHash(t.rows), courses: 1, skills: 2, templates: 1, bundles: 7, gitSha: "abc" });
  });

  it("S9 summary line", async () => {
    const t = setup({ written: 7 });
    await syncCatalog(t.deps);
    const last = t.deps.log.mock.calls.at(-1)![0];
    expect(last).toBe(`[deploy:catalog] synced ${catalogHash(t.rows).slice(0, 8)} templates=1 skills=2 courses=1 new=1 blocked=0 links=1 bundles=7 in 450ms`);
  });

  it("S10 rebuild throws: no record, lock released", async () => {
    const t = setup();
    t.deps.rebuild.mockImplementation(async () => {
      t.calls.push("rebuild");
      throw new Error("nope");
    });
    await expect(syncCatalog(t.deps)).rejects.toThrow("nope");
    expect(t.store.record).not.toHaveBeenCalled();
    expect(t.calls.at(-1)).toBe("release");
  });

  it("S11 concurrency is capped at 5", async () => {
    const urls = Array.from({ length: 12 }, (_, i) => url(i + 1));
    const t = setup({ urls });
    let inflight = 0;
    let max = 0;
    t.deps.check.mockImplementation(async (_def: { url: string; type: string }): Promise<LinkCheck> => {
      inflight++;
      max = Math.max(max, inflight);
      await sleep(1);
      inflight--;
      return live;
    });
    await syncCatalog(t.deps);
    expect(max).toBe(5);
    expect(t.deps.check).toHaveBeenCalledTimes(12);
  });

  it("gate default: the real catalog has no problems", () => {
    expect(catalogGateProblems(catalogSeedRows())).toEqual([]);
  });
});

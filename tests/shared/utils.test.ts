import { describe, expect, it, vi } from "vitest";
import { mapLimit } from "@/lib/shared/utils";
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("mapLimit", () => {
  it("returns results in input order whatever order they finish in", async () => {
    expect(await mapLimit([30, 10, 20], 3, async (ms, i) => { await tick(ms); return `${i}:${ms}`; }))
      .toEqual(["0:30", "1:10", "2:20"]);
  });
  it("runs at most `limit` at once and starts `limit` before any finishes", async () => {
    let inFlight = 0, peak = 0, finished = 0, early = 0;
    await mapLimit(Array.from({ length: 9 }, (_, i) => i), 4, async () => {
      inFlight++; peak = Math.max(peak, inFlight); if (finished === 0) early++;
      await tick(5); inFlight--; finished++;
    });
    expect(peak).toBe(4);
    expect(early).toBe(4);
  });
  it("returns [] for no items without calling fn", async () => {
    const fn = vi.fn();
    expect(await mapLimit([], 3, fn)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });
  it("rejects with the first error and starts nothing after it", async () => {
    const started: number[] = [];
    await expect(mapLimit([0, 1, 2, 3, 4], 1, async (x) => { started.push(x); if (x === 1) throw new Error("boom"); }))
      .rejects.toThrow("boom");
    await tick(5);
    expect(started).toEqual([0, 1]);
  });
  it("treats a limit below 1 as 1", async () => {
    let inFlight = 0, peak = 0;
    await mapLimit([1, 2, 3], 0, async () => { inFlight++; peak = Math.max(peak, inFlight); await tick(1); inFlight--; });
    expect(peak).toBe(1);
  });
});

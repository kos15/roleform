import { afterEach, describe, expect, it, vi } from "vitest";

const end = vi.fn(async () => {});
let calls = 0;
vi.mock("postgres", () => ({
  default: () => {
    const sql = async () => {
      calls += 1;
      if (calls === 2) throw new Error("connection terminated");
      return [];
    };
    sql.end = end;
    return sql;
  },
}));
vi.mock("../../lib/db", () => ({ db: {} }));
vi.mock("../../lib/catalog/liveness", () => ({ checkCourseLink: vi.fn() }));
vi.mock("../../lib/catalog/seed-rows", () => ({ catalogSeedRows: vi.fn() }));
vi.mock("../../lib/services/learning/rebuild-bundles", () => ({ rebuildBundles: vi.fn() }));
vi.mock("../../scripts/catalog/catalog-writes", () => ({
  writeCourseSkills: vi.fn(),
  writeSkills: vi.fn(),
  writeTemplates: vi.fn(),
}));

import { advisoryLock } from "../../scripts/deploy/catalog-store";

afterEach(() => {
  calls = 0;
  end.mockClear();
  vi.restoreAllMocks();
});

describe("advisoryLock release", () => {
  it("swallows an unlock failure, logs the message only, and still ends the session", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const release = await advisoryLock("postgres://direct")();
    await expect(release()).resolves.toBeUndefined();
    expect(end).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0][0])).toMatch(/^\[deploy:catalog\] lock release failed:/);
  });
});

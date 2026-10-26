import { afterEach, describe, expect, it, vi } from "vitest";
import { CRON_JOBS, cronAuthorised } from "@/lib/services/cron";

const S = "s".repeat(32);
const req = (headers: Record<string, string> = {}) => new Request("https://x.test/api/cron/reminders", { headers });

afterEach(() => vi.unstubAllEnvs());

describe("cronAuthorised", () => {
  it("refuses everything when CRON_SECRET is unset", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(cronAuthorised(req({ authorization: "Bearer " }))).toBe(false);
  });

  it("accepts the exact Bearer secret", () => {
    vi.stubEnv("CRON_SECRET", S);
    expect(cronAuthorised(req({ authorization: `Bearer ${S}` }))).toBe(true);
  });

  it("refuses a wrong secret", () => {
    vi.stubEnv("CRON_SECRET", S);
    expect(cronAuthorised(req({ authorization: "Bearer wrong" }))).toBe(false);
  });

  it("refuses a missing header", () => {
    vi.stubEnv("CRON_SECRET", S);
    expect(cronAuthorised(req())).toBe(false);
  });

  it("refuses a lower-case scheme", () => {
    vi.stubEnv("CRON_SECRET", S);
    expect(cronAuthorised(req({ authorization: `bearer ${S}` }))).toBe(false);
  });

  it("refuses a longer value without throwing", () => {
    vi.stubEnv("CRON_SECRET", S);
    expect(() => cronAuthorised(req({ authorization: `Bearer ${S}x` }))).not.toThrow();
    expect(cronAuthorised(req({ authorization: `Bearer ${S}x` }))).toBe(false);
  });
});

describe("CRON_JOBS", () => {
  it("lists the reminders and catalog-refresh jobs", () => {
    expect(CRON_JOBS).toEqual([
      { name: "roleform-round-reminders", path: "/api/cron/reminders", schedule: "*/5 * * * *", timeoutMs: 55_000 },
      { name: "roleform-catalog-refresh", path: "/api/cron/catalog", schedule: "17 3 * * *", timeoutMs: 290_000 },
    ]);
  });

  it("has unique names", () => {
    const names = CRON_JOBS.map((j) => j.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

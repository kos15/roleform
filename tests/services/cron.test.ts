import { afterEach, describe, expect, it, vi } from "vitest";
import { CRON_JOBS, CRON_SECRET_NAME, cronAuthorised, scheduleCommand } from "@/lib/services/cron";

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

describe("scheduleCommand", () => {
  it("builds the catalog job's pg_net call", () => {
    const sql = scheduleCommand(CRON_JOBS[1], "https://roleform.koustubh.org");
    expect(sql).toContain("url := 'https://roleform.koustubh.org/api/cron/catalog'");
    expect(sql).toContain("timeout_milliseconds := 290000");
    expect(sql).toContain("where name = 'roleform_cron_secret'");
  });

  it("doubles single quotes in the app URL and uses the job's timeout", () => {
    const sql = scheduleCommand(CRON_JOBS[0], "https://a.test/o'x");
    expect(sql).toContain("url := 'https://a.test/o''x/api/cron/reminders'");
    expect(sql).toContain("timeout_milliseconds := 55000");
  });

  it("names the Vault secret", () => {
    expect(CRON_SECRET_NAME).toBe("roleform_cron_secret");
  });
});

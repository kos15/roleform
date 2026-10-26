import { describe, expect, it, vi } from "vitest";
import type postgres from "postgres";
import { CRON_JOBS, CRON_SECRET_NAME, scheduleCommand } from "@/lib/services/cron";
import { deploySchedule, installSchedule, scheduleTarget } from "@/scripts/db/install-schedule";

const S = "s".repeat(32);

describe("install-schedule", () => {
  it("scheduleTarget strips trailing slashes", () =>
    expect(scheduleTarget("https://roleform.koustubh.org//", S)).toEqual({ appUrl: "https://roleform.koustubh.org", secret: S }));
  it.each([undefined, "", "http://roleform.koustubh.org"])("APP_URL %j is refused", (u) =>
    expect(() => scheduleTarget(u, S)).toThrow(/APP_URL must be/));
  it("short secret is refused", () => expect(() => scheduleTarget("https://x.org", "s".repeat(31))).toThrow(/CRON_SECRET must be set/));

  it("deploySchedule has no fallback to NEXT_PUBLIC_SITE_URL / VERCEL_PROJECT_PRODUCTION_URL, and refuses before connecting", async () => {
    const connect = vi.fn();
    await expect(
      deploySchedule({ NEXT_PUBLIC_SITE_URL: "https://x.org", VERCEL_PROJECT_PRODUCTION_URL: "x.org", CRON_SECRET: S, DIRECT_URL: "postgres://never" }, connect),
    ).rejects.toThrow(/APP_URL must be/);
    expect(connect).not.toHaveBeenCalled();
  });

  it("installSchedule creates the secret and schedules every CRON_JOBS entry", async () => {
    const seen: { text: string; values: unknown[] }[] = [];
    const fake = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      seen.push({ text: strings.join("?"), values });
      return [];
    }) as unknown as postgres.Sql;
    const lines = await installSchedule(fake, "https://roleform.koustubh.org", S);
    expect(seen[0].text).toContain("create extension if not exists pg_cron");
    expect(seen.find((q) => q.text.includes("vault.create_secret"))!.values).toEqual([S, CRON_SECRET_NAME]);
    for (const job of CRON_JOBS)
      expect(seen.find((q) => q.text.includes("cron.schedule") && q.values[0] === job.name)!.values).toEqual([
        job.name,
        job.schedule,
        scheduleCommand(job, "https://roleform.koustubh.org"),
      ]);
    expect(lines).toEqual(CRON_JOBS.map((j) => `scheduled ${j.name}: ${j.schedule} → https://roleform.koustubh.org${j.path}`));
  });

  const recorder = (vaultRows: unknown[] = []) => {
    const seen: { text: string; values: unknown[] }[] = [];
    const fake = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      seen.push({ text, values });
      return text.includes("from vault.secrets") ? vaultRows : [];
    }) as unknown as postgres.Sql;
    return { seen, fake };
  };

  it("installSchedule runs its statements in order, unscheduling each job before scheduling it", async () => {
    const { seen, fake } = recorder();
    await installSchedule(fake, "https://roleform.koustubh.org", S);
    const keys = seen.map((q) =>
      /create extension if not exists (\w+)/.exec(q.text)?.[0] ??
      (q.text.includes("from vault.secrets") ? "vault select" : q.text.includes("vault.create_secret") ? "create_secret" : q.text.includes("cron.unschedule") ? `unschedule ${q.values[0]}` : q.text.includes("cron.schedule") ? `schedule ${q.values[0]}` : q.text),
    );
    expect(keys).toEqual([
      "create extension if not exists pg_cron",
      "create extension if not exists pg_net",
      "vault select",
      "create_secret",
      ...CRON_JOBS.flatMap((j) => [`unschedule ${j.name}`, `schedule ${j.name}`]),
    ]);
  });

  it("create_secret carries the description", async () => {
    const { seen, fake } = recorder();
    await installSchedule(fake, "https://roleform.koustubh.org", S);
    const q = seen.find((x) => x.text.includes("vault.create_secret"))!;
    expect(q.text + JSON.stringify(q.values)).toContain("Bearer token for /api/cron/* (N24)");
  });

  it("an existing secret is updated in place, not created again", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const { seen, fake } = recorder([{ id }]);
    await installSchedule(fake, "https://roleform.koustubh.org", S);
    expect(seen.find((q) => q.text.includes("vault.update_secret"))!.values).toEqual([id, S]);
    expect(seen.some((q) => q.text.includes("vault.create_secret"))).toBe(false);
  });

  it("deploySchedule closes the connection when the install throws", async () => {
    const end = vi.fn(async () => {});
    const sql = Object.assign(
      async () => {
        throw new Error("boom");
      },
      { end },
    ) as unknown as postgres.Sql;
    await expect(
      deploySchedule({ APP_URL: "https://roleform.koustubh.org", CRON_SECRET: S, DIRECT_URL: "postgres://x" }, () => sql),
    ).rejects.toThrow("boom");
    expect(end).toHaveBeenCalledTimes(1);
  });
});

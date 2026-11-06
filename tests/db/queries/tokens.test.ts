import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  aiRun: { aggregate: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));

import { tokensUsedThisCycle, usageByCycle } from "@/lib/db/queries/tokens";

beforeEach(() => {
  db.aiRun.aggregate.mockReset().mockResolvedValue({ _sum: { inputTokens: 1, outputTokens: 2 } });
  db.$queryRaw.mockReset();
});

describe("the meter leaves enhance_profile out", () => {
  it("tokensUsedThisCycle filters the aggregate", async () => {
    await tokensUsedThisCycle("u1", null);
    expect(db.aiRun.aggregate.mock.calls[0][0].where.purpose).toEqual({ notIn: ["enhance_profile"] });
  });

  it("usageByCycle filters the SQL", async () => {
    db.$queryRaw.mockResolvedValue([
      { bucket: 0, used: BigInt(10) },
      { bucket: -1, used: BigInt(5) },
    ]);
    expect(await usageByCycle("u1", new Date("2026-11-01T00:00:00Z"))).toEqual({ current: 10, past: [5] });
    const [strings, ...values] = db.$queryRaw.mock.calls[0] as [string[], ...unknown[]];
    expect(strings.join("?")).toContain('ai."purpose" <> all(?::text[])');
    expect(values).toContainEqual(["enhance_profile"]);
  });

  it("the aggregate and the SQL agree", async () => {
    await tokensUsedThisCycle("u1", null);
    db.$queryRaw.mockResolvedValue([]);
    await usageByCycle("u1", new Date());
    const [, ...values] = db.$queryRaw.mock.calls[0] as [string[], ...unknown[]];
    expect(values).toContainEqual(db.aiRun.aggregate.mock.calls[0][0].where.purpose.notIn);
  });
});

describe("admin per-member usage", () => {
  const src = readFileSync("lib/admin/members.ts", "utf8");

  it("usageFor reads the metered where", () => {
    expect(src).toMatch(/aiRun\.aggregate\(\{\s*where: meteredRunsWhere\(clerkUserId, since\)/);
  });

  it("workspaceStats still counts all spend", () => {
    const body = src.slice(src.indexOf("export async function workspaceStats"));
    expect(body).toContain("where: { createdAt: { gte: since } }");
  });
});

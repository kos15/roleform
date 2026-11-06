import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  aiRun: { findMany: vi.fn() },
}));
const settlePlan = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/admin/members", () => ({ listAdmins: async () => [] }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("@/lib/db/queries/plan", () => ({ settlePlan }));
vi.mock("@/lib/services/plans/catalog", () => ({ loadPlan: vi.fn(), loadPlanAbove: vi.fn() }));

import { checkEnhanceAllowance, readEnhanceAllowance } from "@/lib/services/auth";

const NOW = new Date("2026-11-06T12:00:00.000Z");
const two = [
  { createdAt: new Date("2026-11-06T08:00:00Z"), schemaValid: true },
  { createdAt: new Date("2026-11-06T10:00:00Z"), schemaValid: true },
];
const member = (over: Record<string, unknown> = {}) => ({ role: "member", suspended: false, capTokens: 500_000, plan: "free", ...over });

beforeEach(() => {
  db.user.findUnique.mockReset();
  db.aiRun.findMany.mockReset();
  settlePlan.mockReset();
});

describe("checkEnhanceAllowance", () => {
  it("is identical on every plan", async () => {
    const results = [];
    for (const plan of ["free", "pro", "ultra"]) {
      db.user.findUnique.mockResolvedValue(member({ plan }));
      db.aiRun.findMany.mockResolvedValue(two);
      results.push(await checkEnhanceAllowance("user_1", NOW));
    }
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    const r = results[0];
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("quota_exhausted");
      expect(r.error.message).toContain("2 every 24 hours, on every plan");
      expect(r.error.detail).toBe("2026-11-07T08:00:00.000Z");
    }
  });

  it("counts enhance runs in the last 24 hours and never settles the plan", async () => {
    db.user.findUnique.mockResolvedValue(member());
    db.aiRun.findMany.mockResolvedValue(two);
    await checkEnhanceAllowance("user_1", NOW);
    expect(db.aiRun.findMany.mock.calls[0][0].where).toEqual({
      clerkUserId: "user_1",
      purpose: "enhance_profile",
      createdAt: { gte: new Date("2026-11-05T12:00:00Z") },
    });
    expect(settlePlan).not.toHaveBeenCalled();
  });

  it("allows with one run used", async () => {
    db.user.findUnique.mockResolvedValue(member());
    db.aiRun.findMany.mockResolvedValue(two.slice(0, 1));
    const r = await checkEnhanceAllowance("user_1", NOW);
    expect(r.ok && r.value.left).toBe(1);
  });

  it("refuses a suspended account", async () => {
    db.user.findUnique.mockResolvedValue(member({ suspended: true }));
    db.aiRun.findMany.mockResolvedValue([]);
    const r = await checkEnhanceAllowance("user_1", NOW);
    expect(!r.ok && r.error.message).toContain("suspended");
  });

  it("refuses a member whose generation is switched off", async () => {
    db.user.findUnique.mockResolvedValue(member({ capTokens: 0 }));
    db.aiRun.findMany.mockResolvedValue([]);
    const r = await checkEnhanceAllowance("user_1", NOW);
    expect(!r.ok && r.error.message).toContain("switched off");
  });

  it("does not apply the switched-off rule to an admin, who is uncapped", async () => {
    db.user.findUnique.mockResolvedValue(member({ role: "admin", capTokens: 0 }));
    db.aiRun.findMany.mockResolvedValue(Array.from({ length: 5 }, () => two[0]));
    expect((await checkEnhanceAllowance("user_1", NOW)).ok).toBe(true);
  });

  it("says when an account does not exist", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.aiRun.findMany.mockResolvedValue([]);
    const r = await checkEnhanceAllowance("user_1", NOW);
    expect(!r.ok && r.error.code).toBe("not_found");
  });
});

describe("readEnhanceAllowance", () => {
  it("reports a suspended member as blocked", async () => {
    db.user.findUnique.mockResolvedValue(member({ suspended: true }));
    db.aiRun.findMany.mockResolvedValue([]);
    const r = await readEnhanceAllowance("user_1", NOW);
    expect(r?.blocked).toBe("suspended");
  });
});

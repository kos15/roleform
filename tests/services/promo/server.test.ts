/**
 * Free-trial codes (F32.1), the I/O half — the paths that raise a plan with
 * no payment (N21 (c)). `@/lib/db` is mocked; each test sets what it reads.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  promoCode: { findUnique: vi.fn() },
  promoRedemption: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn(), updateMany: vi.fn() },
  planPurchase: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/db/queries/plan", () => ({ settlePlan: vi.fn(async () => {}) }));
vi.mock("@/lib/services/plans/catalog", () => ({
  loadPlan: vi.fn(async (id: string) => ({ id, name: "Pro", price: "₹499", pricePaise: 49_900, caps: {} })),
  capColumns: () => ({}),
}));

import { pricePromo, startTrial } from "@/lib/services/promo/server";

const HALLOWEEN = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "HALLOWEN03",
  label: "Halloween free trial",
  kind: "trial",
  percentOff: null,
  amountOffPaise: null,
  trialDays: 3,
  plans: ["pro"],
  startsAt: new Date("2026-10-01T00:00:00Z"),
  endsAt: null,
  maxRedemptions: null as number | null,
  active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.promoCode.findUnique.mockResolvedValue(HALLOWEEN);
  db.promoRedemption.count.mockResolvedValue(0);
  db.promoRedemption.findFirst.mockResolvedValue(null);
  db.user.findUnique.mockResolvedValue({ plan: "free", suspended: false });
  db.user.updateMany.mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
});

describe("pricePromo on a trial code", () => {
  it("counts started trials toward max_redemptions", async () => {
    db.promoCode.findUnique.mockResolvedValue({ ...HALLOWEEN, maxRedemptions: 5 });
    db.promoRedemption.count.mockResolvedValue(5);
    const r = await pricePromo("HALLOWEN03", "pro", null);
    expect(r.ok).toBe(false);
    const where = db.promoRedemption.count.mock.calls[0][0].where;
    expect(where.status.in).toEqual(expect.arrayContaining(["captured", "granted"]));
  });

  it("prices as free with the trial length", async () => {
    const r = await pricePromo("halloween03", "pro", null);
    expect(r.ok && r.value.trialDays).toBe(3);
    expect(r.ok && r.value.amountPaise).toBe(0);
  });
});

describe("startTrial", () => {
  it("raises a Free member for the code's days, scoped to Free", async () => {
    const r = await startTrial("HALLOWEN03", "user_1");
    expect(r.ok).toBe(true);
    const call = db.user.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ clerkUserId: "user_1", plan: "free" });
    const days = (call.data.planExpiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(2.99);
    expect(days).toBeLessThanOrEqual(3);
    const ref = db.planPurchase.create.mock.calls[0][0].data.reference;
    expect(ref).toMatch(/^trial:/);
    expect(db.promoRedemption.create.mock.calls[0][0].data).toMatchObject({ orderId: ref, status: "granted", amountPaise: 0 });
  });

  it("refuses a member already on a paid plan", async () => {
    db.user.findUnique.mockResolvedValue({ plan: "pro", suspended: false });
    const r = await startTrial("HALLOWEN03", "user_1");
    expect(r.ok).toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a suspended member", async () => {
    db.user.findUnique.mockResolvedValue({ plan: "free", suspended: true });
    expect((await startTrial("HALLOWEN03", "user_1")).ok).toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("a payment landing mid-call (no longer Free) grants nothing and says why", async () => {
    db.user.updateMany.mockResolvedValue({ count: 0 });
    const r = await startTrial("HALLOWEN03", "user_1");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.message).not.toMatch(/already had a free trial/);
  });

  it("the one-trial index (P2002) reads as already trialled", async () => {
    db.$transaction.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const r = await startTrial("HALLOWEN03", "user_1");
    expect(!r.ok && r.error.message).toMatch(/already had a free trial/);
  });

  it("refuses a code that is not a trial", async () => {
    db.promoCode.findUnique.mockResolvedValue({ ...HALLOWEEN, kind: "percent", percentOff: 20, trialDays: null });
    expect((await startTrial("HALLOWEN03", "user_1")).ok).toBe(false);
  });
});

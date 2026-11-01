/**
 * Promo codes (F32) and free-trial codes (F32.1). Pure half only.
 */
import { describe, expect, it } from "vitest";
import {
  PromoFormSchema,
  describeDiscount,
  discountedPaise,
  istLocalInput,
  parseIstLocal,
  trialEndsAt,
  trialNudge,
} from "@/lib/domain/promo";
import { sourceOf } from "../structure/files";

const rupees = (p: number) => `₹${p / 100}`;

describe("describeDiscount", () => {
  it("names a trial by its length", () => {
    expect(describeDiscount({ kind: "trial", trialDays: 3 }, rupees)).toBe("3-day free trial");
    expect(describeDiscount({ kind: "trial", trialDays: 1 }, rupees)).toBe("1-day free trial");
  });
  it("still prices percent and flat", () => {
    expect(describeDiscount({ kind: "percent", percentOff: 20 }, rupees)).toBe("20% off");
    expect(discountedPaise(49_900, { kind: "flat", amountOffPaise: 10_000 })).toBe(39_900);
  });
});

describe("PromoFormSchema", () => {
  const base = {
    code: "HALLOWEN03",
    label: "Halloween trial",
    showBanner: true,
    plans: ["pro"],
  };

  it("accepts a trial of 1–30 days on exactly one plan", () => {
    expect(PromoFormSchema.safeParse({ ...base, kind: "trial", trialDays: 3 }).success).toBe(true);
    expect(PromoFormSchema.safeParse({ ...base, kind: "trial", trialDays: 0 }).success).toBe(false);
    expect(PromoFormSchema.safeParse({ ...base, kind: "trial", trialDays: 31 }).success).toBe(false);
    expect(PromoFormSchema.safeParse({ ...base, kind: "trial", trialDays: 3, plans: ["pro", "ultra"] }).success).toBe(false);
  });

  it("a trial carries no money off, and a discount carries no trial days", () => {
    expect(PromoFormSchema.safeParse({ ...base, kind: "trial", trialDays: 3, percentOff: 10 }).success).toBe(false);
    expect(PromoFormSchema.safeParse({ ...base, kind: "percent", percentOff: 10, trialDays: 3 }).success).toBe(false);
    expect(PromoFormSchema.safeParse({ ...base, kind: "percent", percentOff: 10 }).success).toBe(true);
    expect(PromoFormSchema.safeParse({ ...base, kind: "flat" }).success).toBe(false);
  });

  it("never discounts Free", () => {
    expect(PromoFormSchema.safeParse({ ...base, kind: "trial", trialDays: 3, plans: ["free"] }).success).toBe(false);
  });
});

describe("India-time datetime-local round trip", () => {
  it("formats in IST and parses back to the same instant", () => {
    const d = new Date("2026-11-01T18:30:00Z"); // midnight 2 Nov IST
    expect(istLocalInput(d)).toBe("2026-11-02T00:00");
    expect(parseIstLocal("2026-11-02T00:00")).toEqual(d);
    expect(parseIstLocal("")).toBeNull();
    expect(parseIstLocal("nonsense")).toBe("bad");
  });
});

describe("trialEndsAt", () => {
  it("is exactly N days from the moment it starts", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    expect(trialEndsAt(now, 3)).toEqual(new Date("2026-11-04T10:00:00Z"));
  });
});

describe("trialNudge", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  const trial = { reference: "trial:abc", plan: "pro" as const, createdAt: new Date("2026-11-01T10:00:00Z") };

  it("on a running trial: days left and the plan to keep", () => {
    expect(
      trialNudge({ plan: "pro", planExpiresAt: new Date("2026-11-04T10:00:00Z") }, [trial], now),
    ).toEqual({ kind: "on-trial", planId: "pro", daysLeft: 2 });
  });

  it("after the trial lapsed with no purchase: ask once to keep it", () => {
    expect(trialNudge({ plan: "free", planExpiresAt: null }, [trial], now)).toEqual({
      kind: "ended",
      planId: "pro",
    });
  });

  it("says nothing once they paid, were granted a plan, or never trialled", () => {
    const paid = { reference: "pay_123", plan: "pro" as const, createdAt: new Date("2026-11-02T09:00:00Z") };
    expect(trialNudge({ plan: "pro", planExpiresAt: new Date("2026-12-04T10:00:00Z") }, [trial, paid], now)).toBeNull();
    expect(trialNudge({ plan: "free", planExpiresAt: null }, [], now)).toBeNull();
  });

  it("stops asking 30 days after the trial began", () => {
    const later = new Date("2026-12-05T10:00:00Z");
    expect(trialNudge({ plan: "free", planExpiresAt: null }, [trial], later)).toBeNull();
  });
});

describe("the trial migration (F32.1)", () => {
  const schema = sourceOf("prisma/schema.prisma");
  const enumMig = sourceOf("prisma/migrations/20261101000000_trial_promo_enums/migration.sql");
  const mig = sourceOf("prisma/migrations/20261101000100_trial_promos/migration.sql");

  it("adds the trial kind and the granted status in their own migration", () => {
    expect(schema).toMatch(/enum PromoKind \{[^}]*\btrial\b/);
    expect(schema).toMatch(/enum PromoRedemptionStatus \{[^}]*\bgranted\b/);
    expect(enumMig).toMatch(/ADD VALUE 'trial'/);
    expect(enumMig).toMatch(/ADD VALUE 'granted'/);
  });

  it("CHECKs a trial row's shape and allows one trial per member, ever", () => {
    expect(mig).toMatch(/trial_days/);
    expect(mig).toMatch(/promo_codes_discount/);
    expect(mig).toMatch(/cardinality\("plans"\) = 1/);
    expect(mig).toMatch(/CREATE UNIQUE INDEX "promo_redemptions_one_trial_per_member"[\s\S]*WHERE "status" = 'granted'/);
  });

  it("creates HALLOWEN03: three days of Pro", () => {
    expect(mig).toMatch(/'HALLOWEN03'[\s\S]*'trial'[\s\S]*3[\s\S]*ARRAY\['pro'\]/);
    expect(mig).toMatch(/ON CONFLICT \("code"\) DO NOTHING/);
  });
});

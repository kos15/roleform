import { z } from "zod";

/**
 * Promo pricing (F32) and free-trial codes (F32.1). PURE — no I/O. Checkout prices an order with this, the
 * pricing page previews with it, and the webhook trusts the redemption row it
 * produced rather than recomputing, so the amount charged is decided once.
 */

/** Razorpay will not create an order below ₹1. */
export const MIN_CHARGE_PAISE = 100;

export const PROMO_CODE_SHAPE = /^[A-Z0-9-]{3,24}$/;

/** Money off a checkout. */
export type PaidDiscount =
  | { kind: "percent"; percentOff: number }
  | { kind: "flat"; amountOffPaise: number };

/**
 * What a code does. A trial (F32.1) is not a price: it grants N days of one
 * paid plan with no checkout at all, so it never reaches `discountedPaise`.
 */
export type PromoDiscount = PaidDiscount | { kind: "trial"; trialDays: number };

/** A trial lasts 1–30 days. CHECKed in promo_codes_discount too. */
export const MAX_TRIAL_DAYS = 30;

/** The price after the discount, never below Razorpay's floor nor above list. */
export function discountedPaise(listPaise: number, discount: PaidDiscount): number {
  const off =
    discount.kind === "percent"
      ? Math.round((listPaise * discount.percentOff) / 100)
      : discount.amountOffPaise;
  return Math.min(listPaise, Math.max(MIN_CHARGE_PAISE, listPaise - off));
}

/** Upper-cased, trimmed, inner spaces removed — "diwali 25" and "DIWALI25" are one code. */
export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function describeDiscount(discount: PromoDiscount, formatPrice: (p: number) => string): string {
  if (discount.kind === "trial") return `${discount.trialDays}-day free trial`;
  return discount.kind === "percent"
    ? `${discount.percentOff}% off`
    : `${formatPrice(discount.amountOffPaise)} off`;
}

/** No 0/O or 1/I — a code read out on a call should survive being typed. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** `prefix-XXXX`, e.g. `DIWALI-7KQ2`. `random` is injectable for the pure layer. */
export function generateCode(prefix: string, random: () => number = Math.random): string {
  const clean = normaliseCode(prefix).replace(/[^A-Z0-9]/g, "").slice(0, 14) || "FEST";
  let tail = "";
  for (let i = 0; i < 4; i++) tail += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return `${clean}-${tail}`;
}

export type PromoState = "live" | "scheduled" | "ended" | "paused" | "used-up";

export function promoState(
  promo: {
    active: boolean;
    startsAt: Date;
    endsAt: Date | null;
    maxRedemptions: number | null;
  },
  captured: number,
  now: Date = new Date(),
): PromoState {
  if (!promo.active) return "paused";
  if (promo.endsAt && promo.endsAt <= now) return "ended";
  if (promo.startsAt > now) return "scheduled";
  if (promo.maxRedemptions !== null && captured >= promo.maxRedemptions) return "used-up";
  return "live";
}

/* ------------------------------------------------------------- the admin form */

/**
 * The admin's promo form (create and edit share it). The CHECKs on
 * promo_codes say the same thing; this says it before the round trip, with a
 * message. Dates are `datetime-local` strings in India time (`parseIstLocal`).
 */
export const PromoFormSchema = z
  .object({
    code: z.string().max(40),
    label: z.string().trim().min(1).max(60),
    kind: z.enum(["percent", "flat", "trial"]),
    percentOff: z.number().int().min(1).max(90).optional(),
    amountOffPaise: z.number().int().min(100).max(10_000_000).optional(),
    trialDays: z.number().int().min(1).max(MAX_TRIAL_DAYS).optional(),
    plans: z.array(z.enum(["pro", "ultra"])).min(1),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
    maxRedemptions: z.number().int().min(1).max(1_000_000).optional(),
    showBanner: z.boolean(),
    bannerText: z.string().trim().max(160).optional(),
  })
  .refine(
    (v) =>
      v.kind === "percent"
        ? v.percentOff !== undefined && v.amountOffPaise === undefined && v.trialDays === undefined
        : v.kind === "flat"
          ? v.amountOffPaise !== undefined && v.percentOff === undefined && v.trialDays === undefined
          : v.trialDays !== undefined && v.percentOff === undefined && v.amountOffPaise === undefined,
    { message: "discount" },
  )
  // A trial grants one plan; "a free trial of Pro or Ultra" has no answer to "which".
  .refine((v) => v.kind !== "trial" || v.plans.length === 1, { message: "plans" });

export type PromoFormInput = z.infer<typeof PromoFormSchema>;

const IST_OFFSET_MS = 330 * 60_000;

/** A Date as a `datetime-local` value in India time — what the admin form shows. */
export function istLocalInput(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** `datetime-local` gives "YYYY-MM-DDTHH:mm" with no zone; admins are in India. */
export function parseIstLocal(value: string | undefined): Date | null | "bad" {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return "bad";
  const d = new Date(`${value}${value.length === 16 ? ":00" : ""}+05:30`);
  return Number.isNaN(d.getTime()) ? "bad" : d;
}

/* ------------------------------------------------------------------ trials */

const DAY_MS = 86_400_000;

/** A trial runs N whole days from the moment it is started. */
export function trialEndsAt(now: Date, trialDays: number): Date {
  return new Date(now.getTime() + trialDays * DAY_MS);
}

/** How long after a trial began we still offer to keep the plan. */
const NUDGE_WINDOW_MS = 30 * DAY_MS;

export type TrialNudge =
  | { kind: "on-trial"; planId: "pro" | "ultra"; daysLeft: number }
  | { kind: "ended"; planId: "pro" | "ultra" }
  | null;

/**
 * Whether to show the "keep it" note after a free trial (F32.1).
 *
 * Reads only the member's latest `plan_purchases` row: if that is a trial
 * (`trial:` reference) nothing since has paid for or granted a plan. While the
 * trial runs, say how long is left; once it has lapsed, offer the plan at its
 * ordinary price — for 30 days from the trial's start, then stop asking.
 */
export function trialNudge(
  user: { plan: "free" | "pro" | "ultra"; planExpiresAt: Date | null },
  purchases: Array<{ reference: string; plan: "free" | "pro" | "ultra"; createdAt: Date }>,
  now: Date = new Date(),
): TrialNudge {
  const latest = [...purchases].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!latest || !latest.reference.startsWith("trial:") || latest.plan === "free") return null;

  if (user.plan !== "free" && user.planExpiresAt && user.planExpiresAt > now) {
    const daysLeft = Math.max(0, Math.ceil((user.planExpiresAt.getTime() - now.getTime()) / DAY_MS));
    return { kind: "on-trial", planId: latest.plan, daysLeft };
  }
  if (now.getTime() - latest.createdAt.getTime() > NUDGE_WINDOW_MS) return null;
  return { kind: "ended", planId: latest.plan };
}

/** The parts of a code that are its offer — locked once anyone has used it. */
export interface PromoOffer {
  code: string;
  kind: "percent" | "flat" | "trial";
  percentOff: number | null;
  amountOffPaise: number | null;
  trialDays: number | null;
  plans: string[];
}

/** True when an edit would change what a used code is worth or who it is for. */
export function offerChanged(current: PromoOffer, next: PromoOffer): boolean {
  return (
    current.code !== next.code ||
    current.kind !== next.kind ||
    current.percentOff !== next.percentOff ||
    current.amountOffPaise !== next.amountOffPaise ||
    current.trialDays !== next.trialDays ||
    [...current.plans].sort().join() !== [...next.plans].sort().join()
  );
}

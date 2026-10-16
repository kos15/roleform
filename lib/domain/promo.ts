/**
 * Promo pricing (F32). PURE — no I/O. Checkout prices an order with this, the
 * pricing page previews with it, and the webhook trusts the redemption row it
 * produced rather than recomputing, so the amount charged is decided once.
 */

/** Razorpay will not create an order below ₹1. */
export const MIN_CHARGE_PAISE = 100;

export const PROMO_CODE_SHAPE = /^[A-Z0-9-]{3,24}$/;

export type PromoDiscount =
  | { kind: "percent"; percentOff: number }
  | { kind: "flat"; amountOffPaise: number };

/** The price after the discount, never below Razorpay's floor nor above list. */
export function discountedPaise(listPaise: number, discount: PromoDiscount): number {
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

import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { formatPrice, type PlanId } from "@/lib/content/pricing";
import {
  describeDiscount,
  discountedPaise,
  normaliseCode,
  promoState,
  type PromoDiscount,
  type PromoState,
} from "@/lib/domain/promo";
import { appError, err, ok, type Result } from "@/lib/domain/types";
import { loadPlan } from "@/lib/services/plans/catalog";
import type { PromoCode } from "@/lib/generated/prisma/client";

/**
 * Promo codes, the I/O half (F32). The pure pricing is lib/domain/promo.ts.
 *
 * Codes are read only on the server. The banner prints the codes an admin
 * chose to advertise; nothing ever lists the rest to a browser.
 */

function discountOf(row: PromoCode): PromoDiscount {
  return row.kind === "percent"
    ? { kind: "percent", percentOff: row.percentOff ?? 0 }
    : { kind: "flat", amountOffPaise: row.amountOffPaise ?? 0 };
}

async function capturedCount(promoId: string): Promise<number> {
  return db.promoRedemption.count({ where: { promoId, status: "captured" } });
}

export interface PromoBanner {
  code: string;
  label: string;
  text: string;
  endsOn: string | null;
}

/**
 * The live, advertised codes — what the marquee prints. Fails closed (no
 * banner) rather than open: an outage is not a reason to advertise a discount.
 */
export const promoBanners = cache(async (): Promise<PromoBanner[]> => {
  try {
    const now = new Date();
    const rows = await db.promoCode.findMany({
      where: {
        active: true,
        showBanner: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    const live: PromoBanner[] = [];
    for (const row of rows) {
      if (promoState(row, await capturedCount(row.id), now) !== "live") continue;
      const off = describeDiscount(discountOf(row), formatPrice);
      live.push({
        code: row.code,
        label: row.label,
        text: row.bannerText ?? `${row.label}: ${off} with code ${row.code}`,
        endsOn: row.endsAt
          ? row.endsAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
          : null,
      });
    }
    return live;
  } catch {
    return [];
  }
});

export interface PricedPromo {
  promoId: string;
  code: string;
  label: string;
  discount: string;
  listPaise: number;
  amountPaise: number;
  price: string;
}

/**
 * Price `planId` under `rawCode`, or say exactly why not. `clerkUserId` is
 * optional so a signed-out visitor can preview a code on /pricing; checkout
 * always passes it, which adds the once-per-member check.
 */
export async function pricePromo(
  rawCode: string,
  planId: PlanId,
  clerkUserId: string | null,
): Promise<Result<PricedPromo>> {
  const code = normaliseCode(rawCode);
  if (!code) return err(appError("invalid_input", "Enter a code first."));

  const row = await db.promoCode.findUnique({ where: { code } });
  if (!row) return err(appError("not_found", `“${code}” isn't a code we recognise.`));

  const state: PromoState = promoState(row, await capturedCount(row.id));
  if (state !== "live") {
    const why: Record<Exclude<PromoState, "live">, string> = {
      paused: "That code is paused right now.",
      ended: "That offer has ended.",
      scheduled: "That offer hasn't started yet.",
      "used-up": "That code has been fully redeemed.",
    };
    return err(appError("invalid_input", why[state]));
  }

  const plan = await loadPlan(planId);
  if (!row.plans.includes(planId)) {
    return err(appError("invalid_input", `That code doesn't apply to ${plan.name}.`));
  }

  if (clerkUserId) {
    const used = await db.promoRedemption.findFirst({
      where: { promoId: row.id, clerkUserId, status: "captured" },
      select: { id: true },
    });
    if (used) return err(appError("invalid_input", "You've already used that code."));
  }

  const discount = discountOf(row);
  const amountPaise = discountedPaise(plan.pricePaise, discount);
  return ok({
    promoId: row.id,
    code: row.code,
    label: row.label,
    discount: describeDiscount(discount, formatPrice),
    listPaise: plan.pricePaise,
    amountPaise,
    price: formatPrice(amountPaise),
  });
}

export interface AdminPromo {
  id: string;
  code: string;
  label: string;
  discount: string;
  plans: PlanId[];
  state: PromoState;
  startsAt: string;
  endsAt: string | null;
  maxRedemptions: number | null;
  captured: number;
  pending: number;
  revenuePaise: number;
  showBanner: boolean;
  bannerText: string | null;
  active: boolean;
}

export async function listPromos(): Promise<AdminPromo[]> {
  const rows = await db.promoCode.findMany({ orderBy: { createdAt: "desc" } });
  const fmt = (d: Date) =>
    d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return Promise.all(
    rows.map(async (row) => {
      const [captured, pending, revenue] = await Promise.all([
        capturedCount(row.id),
        db.promoRedemption.count({ where: { promoId: row.id, status: "pending" } }),
        db.promoRedemption.aggregate({
          where: { promoId: row.id, status: "captured" },
          _sum: { amountPaise: true },
        }),
      ]);
      return {
        id: row.id,
        code: row.code,
        label: row.label,
        discount: describeDiscount(discountOf(row), formatPrice),
        plans: row.plans,
        state: promoState(row, captured),
        startsAt: fmt(row.startsAt),
        endsAt: row.endsAt ? fmt(row.endsAt) : null,
        maxRedemptions: row.maxRedemptions,
        captured,
        pending,
        revenuePaise: revenue._sum.amountPaise ?? 0,
        showBanner: row.showBanner,
        bannerText: row.bannerText,
        active: row.active,
      };
    }),
  );
}

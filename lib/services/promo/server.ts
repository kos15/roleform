import "server-only";
import { cache } from "react";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { formatPrice, type PlanId } from "@/lib/content/pricing";
import {
  describeDiscount,
  discountedPaise,
  istLocalInput,
  normaliseCode,
  promoState,
  trialEndsAt,
  trialNudge,
  type PromoDiscount,
  type TrialNudge,
  type PromoState,
} from "@/lib/domain/promo";
import { appError, err, ok, type Result } from "@/lib/domain/types";
import { capColumns, loadPlan } from "@/lib/services/plans/catalog";
import { settlePlan } from "@/lib/db/queries/plan";
import type { PromoCode } from "@/lib/generated/prisma/client";

/**
 * Promo codes, the I/O half (F32). The pure pricing is lib/domain/promo.ts.
 *
 * Codes are read only on the server. The banner prints the codes an admin
 * chose to advertise; nothing ever lists the rest to a browser.
 */

function discountOf(row: PromoCode): PromoDiscount {
  if (row.kind === "trial") return { kind: "trial", trialDays: row.trialDays ?? 0 };
  return row.kind === "percent"
    ? { kind: "percent", percentOff: row.percentOff ?? 0 }
    : { kind: "flat", amountOffPaise: row.amountOffPaise ?? 0 };
}

/** Uses that count against `max_redemptions`: paid captures and started trials. */
async function capturedCount(promoId: string): Promise<number> {
  return db.promoRedemption.count({ where: { promoId, status: { in: ["captured", "granted"] } } });
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
          ? row.endsAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })
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
  /** Set on a trial code (F32.1): no checkout, the plan for this many days. */
  trialDays: number | null;
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
      where: { promoId: row.id, clerkUserId, status: { in: ["captured", "granted"] } },
      select: { id: true },
    });
    if (used) return err(appError("invalid_input", "You've already used that code."));
  }

  const discount = discountOf(row);
  if (discount.kind === "trial") {
    if (clerkUserId) {
      const trialled = await db.promoRedemption.findFirst({
        where: { clerkUserId, status: "granted" },
        select: { id: true },
      });
      if (trialled) return err(appError("invalid_input", "You've already had a free trial."));
    }
    return ok({
      promoId: row.id,
      code: row.code,
      label: row.label,
      discount: describeDiscount(discount, formatPrice),
      listPaise: plan.pricePaise,
      amountPaise: 0,
      price: `Free for ${discount.trialDays} day${discount.trialDays === 1 ? "" : "s"}`,
      trialDays: discount.trialDays,
    });
  }
  const amountPaise = discountedPaise(plan.pricePaise, discount);
  return ok({
    promoId: row.id,
    code: row.code,
    label: row.label,
    discount: describeDiscount(discount, formatPrice),
    listPaise: plan.pricePaise,
    amountPaise,
    price: formatPrice(amountPaise),
    trialDays: null,
  });
}

/**
 * Start a free trial (F32.1, N21 (c)). Free members only, one trial per
 * member ever — the partial UNIQUE index `promo_redemptions_one_trial_per_member`
 * is the lock; the checks before it only give a kinder message.
 *
 * The plan is raised here, not in a webhook, because nothing is paid. The
 * audit trail is the `plan_purchases` row whose `trial:` reference matches the
 * `granted` redemption's order id. Lapse is settled on read like any plan.
 */
export async function startTrial(
  rawCode: string,
  clerkUserId: string,
): Promise<Result<{ planName: string; endsOn: string }>> {
  const code = normaliseCode(rawCode);
  const row = code ? await db.promoCode.findUnique({ where: { code } }) : null;
  if (!row || row.kind !== "trial") {
    return err(appError("invalid_input", "That isn't a free-trial code."));
  }
  const planId = row.plans[0] as PlanId;
  const priced = await pricePromo(code, planId, clerkUserId);
  if (!priced.ok) return priced;
  const days = priced.value.trialDays ?? 0;

  await settlePlan(clerkUserId);
  const user = await db.user.findUnique({ where: { clerkUserId }, select: { plan: true, suspended: true } });
  if (!user) return err(appError("not_found", "Your account is still being set up — try again in a moment."));
  if (user.suspended) return err(appError("invalid_input", "This account is suspended, so it can't start a trial."));
  if (user.plan !== "free") {
    return err(appError("invalid_input", "You're already on a paid plan — trials are for members on Free."));
  }

  const plan = await loadPlan(planId);
  const now = new Date();
  const expires = trialEndsAt(now, days);
  const reference = `trial:${randomUUID()}`;
  const NOT_FREE = "not on free";

  try {
    await db.$transaction(async (tx) => {
      await tx.promoRedemption.create({
        data: {
          promoId: row.id,
          clerkUserId,
          plan: plan.id,
          orderId: reference,
          listPaise: plan.pricePaise,
          amountPaise: 0,
          status: "granted",
        },
      });
      await tx.planPurchase.create({ data: { clerkUserId, plan: plan.id, reference } });
      // Scoped to Free: a payment landing between the read above and this
      // write must not be overwritten by a shorter trial.
      const raised = await tx.user.updateMany({
        where: { clerkUserId, plan: "free" },
        data: { plan: plan.id, planExpiresAt: expires, ...capColumns(plan.caps) },
      });
      if (raised.count !== 1) throw new Error(NOT_FREE);
    });
  } catch (e) {
    if (e instanceof Error && e.message === NOT_FREE) {
      return err(appError("conflict", "Your plan just changed — you're no longer on Free, so there's no trial to start."));
    }
    // P2002: the one-trial-per-member index (or the per-code one) refused it.
    if ((e as { code?: string } | null)?.code === "P2002") {
      return err(appError("conflict", "You've already had a free trial."));
    }
    return err(appError("upstream_failed", "We couldn't start the trial just now. Nothing changed — try again."));
  }

  return ok({
    planName: plan.name,
    endsOn: expires.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }),
  });
}

export interface AdminPromo {
  id: string;
  code: string;
  label: string;
  discount: string;
  kind: "percent" | "flat" | "trial";
  percentOff: number | null;
  amountOffPaise: number | null;
  trialDays: number | null;
  /** `datetime-local` values in India time, for the edit form. */
  startsAtInput: string;
  endsAtInput: string;
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
    d.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });

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
        kind: row.kind,
        percentOff: row.percentOff,
        amountOffPaise: row.amountOffPaise,
        trialDays: row.trialDays,
        startsAtInput: istLocalInput(row.startsAt),
        endsAtInput: row.endsAt ? istLocalInput(row.endsAt) : "",
        plans: row.plans as PlanId[],
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

/**
 * The "keep it" note after a free trial (F32.1), read for the app header.
 * Settled first so a lapsed trial reads as Free. Fails closed: no note.
 */
export async function trialNudgeFor(clerkUserId: string): Promise<TrialNudge> {
  try {
    await settlePlan(clerkUserId);
    const [user, purchases] = await Promise.all([
      db.user.findUnique({
        where: { clerkUserId },
        select: { plan: true, planExpiresAt: true, suspended: true },
      }),
      db.planPurchase.findMany({
        where: { clerkUserId },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { reference: true, plan: true, createdAt: true },
      }),
    ]);
    if (!user || user.suspended) return null;
    return trialNudge(user, purchases);
  } catch {
    return null;
  }
}

"use server";

import { auth } from "@clerk/nextjs/server";
import { requireUser } from "@/lib/auth";
import { z } from "zod";
import { createOrder, verifyPaymentSignature, type RazorpayOrder } from "@/lib/payments/razorpay";
import { topupById, canBuyTopup, type PlanId } from "@/lib/content/pricing";
import { loadPlan } from "@/lib/plans/catalog";
import { pricePromo, type PricedPromo } from "@/lib/promo/server";
import { db } from "@/lib/db";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/**
 * Opening a checkout (F17, F19).
 *
 * The amount is read from lib/content/pricing.ts here on the server and never
 * from the client, for the obvious reason: a price the browser sends is a price
 * the browser chooses. The page and the token wall render the same constants, so
 * what someone reads and what they are charged come from one line.
 *
 * Nothing about the account changes here. The plan is raised and the tokens are
 * credited in the webhook, on a payment the provider has confirmed — an action
 * that did either on a click would hand both to anyone who could open the
 * network tab.
 */

const PlanIdSchema = z.enum(["free", "pro", "ultra"]);

/**
 * F32: a promo code, when given, is priced here on the server and written as
 * a `pending` redemption keyed by the order id. The webhook checks the
 * captured amount against THAT row — never against anything the browser sent.
 */
export async function startPlanCheckout(
  planId: PlanId,
  promoCode?: string,
): Promise<Result<RazorpayOrder>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const id = PlanIdSchema.safeParse(planId);
  if (!id.success) return err(appError("invalid_input", "We don't sell that plan."));

  const plan = await loadPlan(id.data);
  if (plan.pricePaise <= 0) {
    return err(appError("invalid_input", "That plan is free — there's nothing to pay for."));
  }

  let promo: PricedPromo | null = null;
  if (promoCode && promoCode.trim()) {
    const priced = await pricePromo(promoCode, plan.id, user.value);
    if (!priced.ok) return priced;
    promo = priced.value;
  }

  const order = await createOrder({
    amountPaise: promo ? promo.amountPaise : plan.pricePaise,
    clerkUserId: user.value,
    notes: promo
      ? { kind: "plan", plan: plan.id, promo: promo.promoId }
      : { kind: "plan", plan: plan.id },
  });
  if (!order.ok || !promo) return order;

  await db.promoRedemption.create({
    data: {
      promoId: promo.promoId,
      clerkUserId: user.value,
      plan: plan.id,
      orderId: order.value.id,
      listPaise: promo.listPaise,
      amountPaise: promo.amountPaise,
    },
  });
  return order;
}

/**
 * The "Apply" button on /pricing. Works signed out — a visitor comparing
 * prices should see what the code does before making an account. Signed in,
 * it also says whether this member has already used it.
 */
export async function previewPromo(
  planId: PlanId,
  promoCode: string,
): Promise<Result<Omit<PricedPromo, "promoId">>> {
  const id = PlanIdSchema.safeParse(planId);
  if (!id.success) return err(appError("invalid_input", "We don't sell that plan."));
  if (typeof promoCode !== "string" || promoCode.length > 40) {
    return err(appError("invalid_input", "That isn't a code we recognise."));
  }
  const { userId } = await auth();
  const priced = await pricePromo(promoCode, id.data, userId ?? null);
  if (!priced.ok) return priced;
  const { promoId: _omit, ...rest } = priced.value;
  void _omit;
  return ok(rest);
}

/**
 * A one-off extra-analysis pack (F19, counts-only pricing).
 *
 * Refused on Free, on the server, because that is where the rule has to live:
 * the wall already hides the card, and a hidden card is a UI decision, not an
 * enforcement. See the note on `TOPUPS` for why the free tier cannot buy its
 * way past its own allowance.
 */
export async function startTopupCheckout(topupId: string): Promise<Result<RazorpayOrder>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const topup = topupById(topupId);
  if (!topup) return err(appError("invalid_input", "We don't sell that pack."));

  const row = await db.user.findUnique({
    where: { clerkUserId: user.value },
    select: { plan: true },
  });
  if (!row || !canBuyTopup(row.plan)) {
    return err(
      appError(
        "invalid_input",
        "Extra-analysis packs are for paid plans. On Free, the way to more analyses is a plan — or the monthly reset, which costs nothing.",
      ),
    );
  }

  return createOrder({
    amountPaise: topup.pricePaise,
    clerkUserId: user.value,
    notes: { kind: "topup", topup: topup.id },
  });
}

/** Kept so existing callers of the Pro button don't have to know about plan ids. */
export async function startProCheckout(): Promise<Result<RazorpayOrder>> {
  return startPlanCheckout("pro");
}

const CheckoutResult = z.object({
  razorpay_order_id: z.string().min(1).max(64),
  razorpay_payment_id: z.string().min(1).max(64),
  razorpay_signature: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * The widget's success handler, checked (Standard Checkout step 3).
 *
 * Grants nothing, whatever the answer. The plan and tokens are written only by
 * the webhook on a captured payment of the right amount (N21). What this buys
 * is an honest message: the browser says "paid" only when Razorpay signed it,
 * and a forged or mangled handler payload is told so instead of being sent on
 * to a page that will never show the plan.
 */
export async function verifyCheckout(input: unknown): Promise<Result<{ verified: true }>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const parsed = CheckoutResult.safeParse(input);
  if (!parsed.success) {
    return err(appError("invalid_input", "The payment window didn't send back everything we need to confirm it."));
  }

  const verified = verifyPaymentSignature({
    orderId: parsed.data.razorpay_order_id,
    paymentId: parsed.data.razorpay_payment_id,
    signature: parsed.data.razorpay_signature,
  });
  if (!verified) {
    return err(
      appError(
        "invalid_input",
        "We couldn't confirm that payment. If money left your account, write to us with the payment id and we'll sort it out.",
      ),
    );
  }

  return ok({ verified: true });
}

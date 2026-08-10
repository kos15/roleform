"use server";

import { requireUser } from "@/lib/auth";
import { createOrder, type RazorpayOrder } from "@/lib/payments/razorpay";
import { planById, topupById, canBuyTopup, type PlanId } from "@/lib/content/pricing";
import { db } from "@/lib/db";
import { appError, err, type Result } from "@/lib/domain/types";

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

export async function startPlanCheckout(planId: PlanId): Promise<Result<RazorpayOrder>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const plan = planById(planId);
  if (plan.pricePaise <= 0) {
    return err(appError("invalid_input", "That plan is free — there's nothing to pay for."));
  }

  return createOrder({
    amountPaise: plan.pricePaise,
    clerkUserId: user.value,
    notes: { kind: "plan", plan: plan.id },
  });
}

/**
 * A one-off token pack (F19).
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
        "Top-ups are for paid plans. On Free, the way to more tokens is a plan — or the reset, which costs nothing.",
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

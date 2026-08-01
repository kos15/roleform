"use server";

import { requireUser } from "@/lib/auth";
import { createOrder, type RazorpayOrder } from "@/lib/payments/razorpay";
import { PRO_PRICE_PAISE } from "@/lib/content/pricing";
import { ok, type Result } from "@/lib/domain/types";

/**
 * Open a Pro checkout (F17).
 *
 * The amount is read from `PRO_PRICE_PAISE` here on the server and never from
 * the client, for the obvious reason: a price the browser sends is a price the
 * browser chooses. The page renders the same constant, so what someone reads
 * and what they are charged come from one line.
 *
 * Nothing about the account changes here. The upgrade happens in the webhook,
 * on a payment the provider has confirmed — an action that flipped the plan on
 * a click would grant Pro to anyone who could open the network tab.
 */
export async function startProCheckout(): Promise<Result<RazorpayOrder>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const order = await createOrder({
    amountPaise: PRO_PRICE_PAISE,
    clerkUserId: user.value,
    planId: "pro",
  });
  if (!order.ok) return order;

  return ok(order.value);
}

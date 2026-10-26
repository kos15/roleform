import { db } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/services/payments/razorpay";
import { LEGACY_TOKEN_TOPUPS, PLAN_IDS, topupById, type PlanId } from "@/lib/content/pricing";
import { capColumns, loadPlan } from "@/lib/services/plans/catalog";
import { deliver } from "@/lib/services/mail/deliver";
import { SUPPORT_EMAIL } from "@/lib/services/mail/addresses";

/**
 * Razorpay payment lifecycle (F17, F19, F23). The second route handler that
 * isn't a stream, and the only place `users.plan` is raised or `token_grants`
 * / `plan_purchases` written from a purchase.
 *
 * Signature verification is not optional: this endpoint is public and it grants
 * a paid plan. An unsigned or wrongly-signed request is refused before the body
 * is parsed, let alone acted on.
 *
 * **The caps travel with the plan.** Upgrading writes that plan's seven caps
 * (lib/content/pricing.ts) onto the account, because the pricing page's table
 * IS those numbers — if the plan changed without them, the page would have
 * promised something the enforcement seams never heard about.
 *
 * **A plan expires (F23, G7).** Before this file, one `payment.captured`
 * raised `users.plan` and nothing ever lowered it — a ₹499 payment granted
 * Pro forever. Every purchase now EXTENDS `plan_expires_at` from
 * `greatest(now, current expiry)`, never sets it outright: buying again
 * before the current period ends adds 30 days on top, rather than resetting
 * the clock and quietly shortening what was already paid for. `lib/services/auth.ts`
 * and `lib/admin/members.ts` settle the lapse back to Free on read — there is
 * no scheduler that does it on a timer (CLAUDE.md §8).
 *
 * **A top-up increments, never sets.** Two packs bought in one cycle are two
 * packs' worth of tokens, and a redelivered webhook would be a third — which is
 * why the note carries the order's own payment id and a credit is only applied
 * once per payment (see `alreadyCredited`).
 *
 * **The captured amount is checked against the price (G8).** A mismatch
 * grants nothing — the money already moved, and reversing it is not this
 * endpoint's job — and is filed to the admin inbox for a person to resolve.
 * The webhook still answers 200: nothing about a wrong amount is worth
 * Razorpay retrying for a day.
 */
export async function POST(request: Request) {
  // The raw text, not the parsed body: the HMAC is over the exact bytes sent,
  // and re-serialising JSON would change them.
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(raw, signature)) {
    return new Response("bad signature", { status: 401 });
  }

  let event: {
    event?: string;
    payload?: {
      payment?: {
        entity?: { id?: string; order_id?: string; amount?: number; notes?: Record<string, string> };
      };
    };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("unparseable", { status: 400 });
  }

  // `payment.captured` is the settled state. `payment.authorized` is money that
  // has been held and can still fail to settle, and granting a plan on it means
  // granting a plan that may be reversed.
  if (event.event !== "payment.captured") {
    return new Response("ignored", { status: 200 });
  }

  const entity = event.payload?.payment?.entity;
  const notes = entity?.notes ?? {};
  const clerkUserId = notes.clerk_user_id;
  if (!clerkUserId) {
    // Nothing to act on, and nothing worth retrying — 200 so the provider stops
    // redelivering a payment we can never attribute.
    return new Response("no subject", { status: 200 });
  }

  if (notes.kind === "topup") {
    return creditTopup(clerkUserId, notes.topup, entity?.id, entity?.amount);
  }

  // Anything else is a plan purchase. `kind` is absent on orders created before
  // top-ups existed, and those were all Pro — so the fallback is Pro, not a
  // refusal that would strand a payment already taken.
  return raisePlan(
    clerkUserId,
    (notes.plan ?? "pro") as PlanId,
    entity?.id,
    entity?.amount,
    notes.promo ? entity?.order_id : undefined,
  );
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function raisePlan(
  clerkUserId: string,
  planId: PlanId,
  paymentId: string | undefined,
  amountPaise: number | undefined,
  promoOrderId: string | undefined,
): Promise<Response> {
  if (!PLAN_IDS.includes(planId)) {
    return new Response("unknown plan", { status: 200 });
  }
  const plan = await loadPlan(planId);

  // F32: a discounted order is checked against the redemption row checkout
  // wrote when it priced the order — the amount decided once, on the server.
  // A promo order with no such row is treated as an ordinary one, so the list
  // price applies and a forged note buys nothing.
  const redemption = promoOrderId
    ? await db.promoRedemption.findUnique({ where: { orderId: promoOrderId } })
    : null;
  const usable =
    redemption && redemption.clerkUserId === clerkUserId && redemption.plan === plan.id
      ? redemption
      : null;
  const expectedPaise = usable ? usable.amountPaise : plan.pricePaise;

  if (amountPaise !== undefined && amountPaise !== expectedPaise) {
    await fileAmountMismatch({
      clerkUserId,
      kind: "plan",
      wanted: usable ? `${plan.name} (promo)` : plan.name,
      expectedPaise,
      capturedPaise: amountPaise,
      paymentId,
    });
    return new Response("amount mismatch", { status: 200 });
  }

  if (!paymentId) return new Response("no payment id", { status: 200 });

  // Idempotency (G7): a redelivered webhook for a payment already applied
  // must extend the expiry by zero days, not another 30. The unique index on
  // `reference` is what turns the second delivery into a conflict.
  try {
    await db.planPurchase.create({ data: { clerkUserId, plan: plan.id, reference: paymentId } });
  } catch {
    return new Response("already applied", { status: 200 });
  }

  // Extend, never set outright (F23): buying again before the current period
  // ends adds 30 days on top of what is left, rather than resetting the clock.
  const current = await db.user.findUnique({
    where: { clerkUserId },
    select: { planExpiresAt: true },
  });
  const now = new Date();
  const base = current?.planExpiresAt && current.planExpiresAt > now ? current.planExpiresAt : now;
  const planExpiresAt = new Date(base.getTime() + THIRTY_DAYS_MS);

  // updateMany, not update: a webhook for an account that no longer exists must
  // be a no-op, not a 500 that Razorpay retries for a day. Same reasoning as
  // the Clerk handler's out-of-order guard.
  await db.user.updateMany({
    where: { clerkUserId },
    data: { plan: plan.id, planExpiresAt, ...capColumns(plan.caps) },
  });

  if (usable && usable.status === "pending") {
    try {
      await db.promoRedemption.update({
        where: { id: usable.id },
        data: { status: "captured", paymentId, capturedAt: new Date() },
      });
    } catch {
      // The partial unique index refused a second captured use by the same
      // member (two tabs, two orders). The plan is already granted — the money
      // moved — so the row stays pending and the admin sees it in the counts.
    }
  }

  return new Response("ok", { status: 200 });
}

/**
 * Credit a one-off pack (F19).
 *
 * The payment id is the grant's `reference`, which is UNIQUE — so Razorpay
 * redelivering this webhook (it will, on any non-2xx, for a day) hits the
 * index and not the balance. Idempotency as a constraint rather than as a
 * check somebody has to remember to write (CLAUDE.md §11).
 *
 * A conflict is a success: the tokens are already there. Returning anything
 * other than 200 would ask the provider to try again forever.
 */
async function creditTopup(
  clerkUserId: string,
  topupId: string | undefined,
  paymentId: string | undefined,
  amountPaise: number | undefined,
): Promise<Response> {
  const topup = topupId ? topupById(topupId) : null;
  // An order placed before counts-only pricing and paid after it is credited
  // as the analyses the old pack was sold as (same prices: ₹99 = 5, ₹249 = 15).
  const legacy = topupId ? LEGACY_TOKEN_TOPUPS.find((t) => t.id === topupId) : undefined;
  if ((!topup && !legacy) || !paymentId) return new Response("unattributable top-up", { status: 200 });

  const expectedPaise = topup ? topup.pricePaise : legacy!.pricePaise;
  if (amountPaise !== undefined && amountPaise !== expectedPaise) {
    await fileAmountMismatch({
      clerkUserId,
      kind: "topup",
      wanted: `${topup ? topup.analyses : legacy!.analyses} extra analyses`,
      expectedPaise,
      capturedPaise: amountPaise,
      paymentId,
    });
    return new Response("amount mismatch", { status: 200 });
  }

  try {
    await db.analysisGrant.create({
      data: { clerkUserId, analyses: topup ? topup.analyses : legacy!.analyses, source: "purchase", reference: paymentId },
    });
  } catch {
    // Unique violation (already credited) or a deleted account. Neither is
    // worth a retry, and neither is worth a trace that carries the subject (N7).
    return new Response("already applied", { status: 200 });
  }

  return new Response("ok", { status: 200 });
}

/**
 * G8 — a captured amount that does not match what was priced.
 *
 * The money already moved; this endpoint cannot reverse it, and it must not
 * grant something the amount does not back either. So it grants nothing and
 * files the discrepancy to the support inbox (the contact_messages table the
 * admin panel reads) — a person resolves it, by hand, once.
 * The Clerk subject is included so an admin can find the account without a
 * second round trip, and no payment method detail or card data ever reaches
 * this function to begin with (Razorpay does not send it).
 */
async function fileAmountMismatch(args: {
  clerkUserId: string;
  kind: "plan" | "topup";
  wanted: string;
  expectedPaise: number;
  capturedPaise: number;
  paymentId: string | undefined;
}): Promise<void> {
  const row = await db.contactMessage.create({
    data: {
      clerkUserId: args.clerkUserId,
      name: "Razorpay webhook",
      email: `noreply@${SUPPORT_EMAIL.split("@")[1] ?? "localhost"}`,
      subject: "Payment amount mismatch",
      body: [
        `A captured payment did not match its price and nothing was granted.`,
        `Clerk subject: ${args.clerkUserId}`,
        `Wanted: ${args.wanted} (${args.kind})`,
        `Expected: ${args.expectedPaise} paise`,
        `Captured: ${args.capturedPaise} paise`,
        `Payment id: ${args.paymentId ?? "unknown"}`,
      ].join("\n"),
    },
  });

  // No receipt: the address on this row is a placeholder, not a person, the
  // same shape as the admin-access-request row.
  await deliver(
    {
      id: row.id,
      name: row.name,
      email: row.email,
      subject: row.subject,
      body: row.body,
      clerkUserId: row.clerkUserId,
    },
    { receipt: false },
  );
}

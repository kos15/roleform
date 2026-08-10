import { db } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { PLANS, planById, topupById, type PlanId } from "@/lib/content/pricing";

/**
 * Razorpay payment lifecycle (F17, F19). The second route handler that isn't a
 * stream, and the only place `users.plan` is raised or `topup_tokens` credited.
 *
 * Signature verification is not optional: this endpoint is public and it grants
 * a paid plan. An unsigned or wrongly-signed request is refused before the body
 * is parsed, let alone acted on.
 *
 * **The caps travel with the plan.** Upgrading writes that plan's five caps
 * (lib/content/pricing.ts) onto the account, because the pricing page's table
 * IS those numbers — if the plan changed without them, the page would have
 * promised something the enforcement seams never heard about.
 *
 * **A top-up increments, never sets.** Two packs bought in one cycle are two
 * packs' worth of tokens, and a redelivered webhook would be a third — which is
 * why the note carries the order's own payment id and a credit is only applied
 * once per payment (see `alreadyCredited`).
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
    payload?: { payment?: { entity?: { id?: string; notes?: Record<string, string> } } };
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
    return creditTopup(clerkUserId, notes.topup, entity?.id);
  }

  // Anything else is a plan purchase. `kind` is absent on orders created before
  // top-ups existed, and those were all Pro — so the fallback is Pro, not a
  // refusal that would strand a payment already taken.
  return raisePlan(clerkUserId, (notes.plan ?? "pro") as PlanId);
}

async function raisePlan(clerkUserId: string, planId: PlanId): Promise<Response> {
  if (!PLANS.some((p) => p.id === planId)) {
    return new Response("unknown plan", { status: 200 });
  }
  const plan = planById(planId);

  // updateMany, not update: a webhook for an account that no longer exists must
  // be a no-op, not a 500 that Razorpay retries for a day. Same reasoning as
  // the Clerk handler's out-of-order guard.
  await db.user.updateMany({
    where: { clerkUserId },
    data: {
      plan: plan.id,
      capTokens: plan.caps.tokens,
      capAnalyses: plan.caps.analyses,
      capResumes: plan.caps.resumes,
      capAnswers: plan.caps.answers,
      capCourses: plan.caps.courses,
    },
  });

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
): Promise<Response> {
  const topup = topupId ? topupById(topupId) : null;
  if (!topup || !paymentId) return new Response("unattributable top-up", { status: 200 });

  try {
    await db.tokenGrant.create({
      data: {
        clerkUserId,
        tokens: topup.tokens,
        source: "purchase",
        reference: paymentId,
      },
    });
  } catch {
    // Unique violation (already credited) or a deleted account. Neither is
    // worth a retry, and neither is worth a trace that carries the subject (N7).
    return new Response("already applied", { status: 200 });
  }

  return new Response("ok", { status: 200 });
}

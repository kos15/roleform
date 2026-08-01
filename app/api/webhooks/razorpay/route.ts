import { db } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { planById } from "@/lib/content/pricing";

/**
 * Razorpay payment lifecycle (F17). The second route handler that isn't a
 * stream, and the only place `users.plan` is ever raised.
 *
 * Signature verification is not optional: this endpoint is public and it grants
 * a paid plan. An unsigned or wrongly-signed request is refused before the body
 * is parsed, let alone acted on.
 *
 * **The caps travel with the plan.** Upgrading writes the Pro row's four caps
 * (lib/content/pricing.ts) onto the account, because the pricing page's table
 * IS those numbers — if the plan changed without them, the page would have
 * promised something the enforcement seams never heard about.
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
    payload?: { payment?: { entity?: { notes?: Record<string, string> } } };
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

  const notes = event.payload?.payment?.entity?.notes ?? {};
  const clerkUserId = notes.clerk_user_id;
  if (!clerkUserId) {
    // Nothing to act on, and nothing worth retrying — 200 so the provider stops
    // redelivering a payment we can never attribute.
    return new Response("no subject", { status: 200 });
  }

  const pro = planById("pro");

  // updateMany, not update: a webhook for an account that no longer exists must
  // be a no-op, not a 500 that Razorpay retries for a day. Same reasoning as
  // the Clerk handler's out-of-order guard.
  await db.user.updateMany({
    where: { clerkUserId },
    data: {
      plan: "pro",
      capAnalyses: pro.caps.analyses,
      capResumes: pro.caps.resumes,
      capAnswers: pro.caps.answers,
      capCourses: pro.caps.courses,
    },
  });

  return new Response("ok", { status: 200 });
}

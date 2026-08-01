import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/**
 * Razorpay, over `fetch` and `node:crypto` (F17).
 *
 * No SDK. Order creation is one authenticated POST and webhook verification is
 * one HMAC — a dependency for that is a dependency to audit, pin and update for
 * no capability we would gain. The same reasoning that kept Puppeteer and
 * LangChain out (CLAUDE.md §8).
 *
 * **Keys are server-only.** `RAZORPAY_KEY_SECRET` and the webhook secret never
 * leave this module; the publishable `key_id` reaches the browser because the
 * checkout widget needs it, and it is publishable by design.
 */

const API = "https://api.razorpay.com/v1";

function credentials(): Result<{ keyId: string; keySecret: string }> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  // A missing key is a deployment fact, not a user error — but the user is the
  // one standing in front of it, so the message says what they can do rather
  // than naming an environment variable at them.
  if (!keyId || !keySecret) {
    return err(
      appError("misconfigured", "Card payments aren't switched on yet. Write to us and we'll sort it out by hand."),
    );
  }
  return ok({ keyId, keySecret });
}

export function isPaymentsConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  keyId: string;
}

/**
 * Create an order to hand to the checkout widget.
 *
 * `notes.clerk_user_id` is how the webhook finds the account to upgrade. It is
 * an opaque subject, never an address (N7) — the same thing the access-request
 * path already carries for the same reason.
 */
export async function createOrder(args: {
  amountPaise: number;
  clerkUserId: string;
  planId: string;
}): Promise<Result<RazorpayOrder>> {
  const creds = credentials();
  if (!creds.ok) return creds;

  const auth = Buffer.from(`${creds.value.keyId}:${creds.value.keySecret}`).toString("base64");

  let response: Response;
  try {
    response = await fetch(`${API}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: args.amountPaise,
        currency: "INR",
        notes: { clerk_user_id: args.clerkUserId, plan: args.planId },
      }),
    });
  } catch {
    // N7: the failure is logged nowhere. A network error here carries the
    // subject in the request we just built, and none of it is worth a trace.
    return err(appError("upstream_failed", "We couldn't reach the payment provider. Try again in a moment."));
  }

  if (!response.ok) {
    return err(appError("upstream_failed", "The payment provider refused that request."));
  }

  const body = (await response.json()) as { id?: string; amount?: number; currency?: string };
  if (!body.id) {
    return err(appError("upstream_failed", "The payment provider sent back something we couldn't use."));
  }

  return ok({
    id: body.id,
    amount: body.amount ?? args.amountPaise,
    currency: body.currency ?? "INR",
    keyId: creds.value.keyId,
  });
}

/**
 * Webhook signature check.
 *
 * `timingSafeEqual` rather than `===`: this compares a secret-derived digest
 * against an attacker-supplied one, which is the textbook case for it. Length
 * is checked first because `timingSafeEqual` throws on a mismatch.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

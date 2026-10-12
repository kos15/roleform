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

/**
 * An env value, trimmed. A key pasted into a dashboard with a trailing space or
 * newline is the commonest way to end up with a "wrong" key that looks right,
 * and Razorpay answers it with the same 401 as a genuinely wrong one.
 */
function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function credentials(): Result<{ keyId: string; keySecret: string }> {
  const keyId = env("RAZORPAY_KEY_ID");
  const keySecret = env("RAZORPAY_KEY_SECRET");

  // A missing key is a deployment fact, not a user error — but the user is the
  // one standing in front of it, so the message says what they can do rather
  // than naming an environment variable at them. The log names the variable
  // (never its value) so whoever deploys can tell this apart from a 401.
  if (!keyId || !keySecret) {
    const missing = [!keyId && "RAZORPAY_KEY_ID", !keySecret && "RAZORPAY_KEY_SECRET"].filter(Boolean);
    console.error(`[payments] not configured missing=${missing.join(",")}`);
    return err(
      appError("misconfigured", "Card payments aren't switched on yet. Write to us and we'll sort it out by hand."),
    );
  }
  return ok({ keyId, keySecret });
}

export function isPaymentsConfigured(): boolean {
  return Boolean(env("RAZORPAY_KEY_ID") && env("RAZORPAY_KEY_SECRET"));
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
 * `notes.clerk_user_id` is how the webhook finds the account to credit. It is
 * an opaque subject, never an address (N7) — the same thing the access-request
 * path already carries for the same reason.
 *
 * The rest of `notes` says WHAT was bought, because the webhook has nothing
 * else to go on: a payment for ₹99 and a payment for ₹499 arrive through the
 * same endpoint, and inferring the purchase from the amount would mean a price
 * change silently granting the wrong thing.
 */
export async function createOrder(args: {
  amountPaise: number;
  clerkUserId: string;
  notes: Record<string, string>;
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
        notes: { clerk_user_id: args.clerkUserId, ...args.notes },
      }),
    });
  } catch {
    // N7: the failure is logged nowhere. A network error here carries the
    // subject in the request we just built, and none of it is worth a trace.
    return err(appError("upstream_failed", "We couldn't reach the payment provider. Try again in a moment."));
  }

  if (!response.ok) {
    // Razorpay's error code and description say what it objected to ("BAD_REQUEST_ERROR
    // Authentication failed") and carry nothing about the payer (N7). The key
    // id's mode prefix is logged so a test/live mismatch is visible; the id
    // itself is publishable, but its prefix is all the log needs.
    const detail = await upstreamError(response);
    const keyId = creds.value.keyId;
    const mode = keyId.startsWith("rzp_live_") ? "live" : keyId.startsWith("rzp_test_") ? "test" : "unknown";
    console.error(`[payments] order create failed status=${response.status} key_mode=${mode} ${detail}`);

    // 401 is Razorpay refusing our keys, not the user's request: a deployment
    // fact, with its own sentence so it can't be mistaken for unset keys.
    if (response.status === 401) {
      return err(
        appError("misconfigured", "Payments are set up but the provider rejected our keys. Write to us and we'll fix it."),
      );
    }
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
  const secret = env("RAZORPAY_WEBHOOK_SECRET");
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/**
 * Checkout signature check — the handler's three ids, after the widget closes.
 *
 * Razorpay signs `order_id|payment_id` with the KEY secret (the webhook uses
 * its own secret over the raw body). A match proves the browser is reporting a
 * payment Razorpay actually made against an order we created. It proves the
 * payment was made, not that it was captured, so nothing is granted on it;
 * the webhook still does that (N21).
 */
export function verifyPaymentSignature(args: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const secret = env("RAZORPAY_KEY_SECRET");
  if (!secret) return false;

  const expected = createHmac("sha256", secret).update(`${args.orderId}|${args.paymentId}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(args.signature, "utf8");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/** `code description` from a Razorpay error body, or the bare status text. */
async function upstreamError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { code?: string; description?: string } };
    const code = body.error?.code ?? "unknown";
    const description = (body.error?.description ?? "").replace(/\s+/g, " ").slice(0, 160);
    return `code=${code} description="${description}"`;
  } catch {
    return `code=unparseable`;
  }
}

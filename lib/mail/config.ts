import "server-only";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/**
 * Mail configuration (F16).
 *
 * **Unset is a supported state**, the same way payments are (lib/payments/
 * razorpay.ts). A deployment with no mail keys still takes contact messages —
 * they land in `contact_messages` and the admin inbox is the read path. What it
 * must never do is tell the sender we have emailed anyone.
 *
 * Three variables, all server-only:
 *   RESEND_API_KEY  — the provider credential.
 *   CONTACT_FROM    — an address on a domain verified with the provider. This
 *                     is a deliverability fact, not a preference: mail sent
 *                     from a domain we cannot sign is mail that lands in spam.
 *   CONTACT_TO      — where support mail is read. Comma-separated is allowed.
 *
 * Provider: Resend, over `fetch` (lib/mail/send.ts). Swapping to another HTTP
 * mail API is one file — that file — because nothing above this layer knows a
 * provider name.
 */

export interface MailConfig {
  apiKey: string;
  /** RFC 5322 address or `Name <addr>`; the provider accepts both. */
  from: string;
  to: string[];
}

export function mailConfig(): Result<MailConfig> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.CONTACT_FROM?.trim();
  const to = (process.env.CONTACT_TO ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);

  if (!apiKey || !from || to.length === 0) {
    // The caller decides what the user sees. This message is for an operator
    // reading the admin inbox, and names no address (N7).
    return err(
      appError(
        "misconfigured",
        "Outbound mail isn't configured on this deployment, so the message was filed rather than sent.",
      ),
    );
  }

  return ok({ apiKey, from, to });
}

export function isMailConfigured(): boolean {
  return mailConfig().ok;
}

/**
 * Where this deployment lives, for the one link a notification carries.
 *
 * `NEXT_PUBLIC_APP_URL` when set; Vercel's own production URL otherwise, which
 * makes preview and production correct without either being configured. Null is
 * fine — the mail then simply carries no inbox link rather than a broken one.
 */
export function appUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

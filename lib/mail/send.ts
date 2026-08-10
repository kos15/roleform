import "server-only";
import { mailConfig } from "@/lib/mail/config";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/**
 * Outbound mail, over `fetch` (F16).
 *
 * No SDK, for the reason the Razorpay module gives: sending one message is one
 * authenticated POST, and a dependency for that is a dependency to audit, pin
 * and update for no capability we would gain (CLAUDE.md §8).
 *
 * The provider is Resend. Its free tier is 3,000 messages a month with no
 * expiry, which support volume never approaches — and if it ever does, this
 * file is the only thing that changes.
 *
 * **Nothing here is logged.** A support message is the most sensitive thing on
 * a public page after a résumé, and every field of it is PII (N7). Failures
 * come back as a `Result` carrying the provider's own words, which the caller
 * stores on the row and shows only to an admin.
 */

const ENDPOINT = "https://api.resend.com/emails";

/** Long enough for a slow provider, short enough that a submit still feels live. */
const TIMEOUT_MS = 10_000;

export interface Mail {
  /** Omitted means CONTACT_TO — the deployment's own support inbox. */
  to?: string[];
  subject: string;
  text: string;
  html: string;
  /** Where a reply should go — the sender, for a support notification. */
  replyTo?: string;
}

export async function sendMail(mail: Mail): Promise<Result<{ id: string }>> {
  const config = mailConfig();
  if (!config.ok) return config;

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.value.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.value.from,
        to: mail.to?.length ? mail.to : config.value.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await describe(response);
      return err(appError("upstream_failed", "The mail provider refused that message.", detail));
    }

    const payload = (await response.json()) as { id?: string };
    if (!payload.id) {
      return err(
        appError("upstream_failed", "The mail provider accepted that without confirming it."),
      );
    }
    return ok({ id: payload.id });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return err(
      appError(
        "upstream_failed",
        timedOut
          ? "The mail provider didn't answer in time."
          : "We couldn't reach the mail provider.",
      ),
    );
  }
}

/**
 * The provider's error, trimmed to something an admin can read in a table cell.
 * Resend answers `{ name, message, statusCode }`; anything else falls back to
 * the status line rather than dumping a body of unknown shape onto the row.
 */
async function describe(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string; name?: string };
    const message = body.message ?? body.name;
    if (message) return `${response.status}: ${message}`.slice(0, 300);
  } catch {
    // A non-JSON error body tells us nothing the status doesn't.
  }
  return `${response.status} ${response.statusText}`.trim().slice(0, 300);
}

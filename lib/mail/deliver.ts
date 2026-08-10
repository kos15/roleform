import "server-only";
import { db } from "@/lib/db";
import { appUrl, isMailConfigured } from "@/lib/mail/config";
import { notification, receipt, type ContactMail } from "@/lib/mail/contact";
import { sendMail } from "@/lib/mail/send";
import type { MailDelivery } from "@/lib/generated/prisma/enums";

/**
 * Sending a filed support message, and recording what happened (F16).
 *
 * **Deliberately not a Server Action.** Everything exported from a `"use
 * server"` module is a public endpoint, and an endpoint that mails arbitrary
 * caller-supplied text to our support inbox — and a receipt to any address the
 * caller names — is an open relay wearing our return path. So this lives here,
 * server-only, and the two callers that may reach it (the contact action, and
 * the admin retry) each do their own authorisation first.
 */

export interface DeliveryOutcome {
  notification: MailDelivery;
  /** Null when no receipt was attempted — not the same as one that failed. */
  receipt: MailDelivery | null;
  error: string | null;
}

export interface DeliverOptions {
  /**
   * Send the sender their copy. False for a retry from the inbox (they had
   * their receipt at submit, and a second one days later would announce an
   * arrival that didn't happen) and for the access-request row, whose address
   * is a placeholder rather than a person.
   */
  receipt?: boolean;
}

/**
 * Send, and write the outcome onto the row.
 *
 * Sequential rather than parallel, and deliberately: the notification is the
 * one that has to arrive — it is how a human ever learns the message exists —
 * so it gets the provider's attention first, and its failure is the one whose
 * reason we keep. Both are attempted regardless; a bounced receipt (a typo'd
 * address) must not stop us hearing about the message.
 *
 * Never throws. The row is already written by the time this runs, which is the
 * whole point of the ordering: this is the part that is allowed to fail.
 */
export async function deliver(
  message: ContactMail,
  options: DeliverOptions = {},
): Promise<DeliveryOutcome> {
  const wantsReceipt = options.receipt ?? true;

  if (!isMailConfigured()) {
    return await record(message.id, {
      notification: "disabled",
      receipt: wantsReceipt ? "disabled" : null,
      error: null,
    });
  }

  const sentNotification = await sendMail(notification(message, appUrl()));
  const sentReceipt = wantsReceipt ? await sendMail(receipt(message)) : null;

  return await record(message.id, {
    notification: sentNotification.ok ? "sent" : "failed",
    receipt: sentReceipt === null ? null : sentReceipt.ok ? "sent" : "failed",
    error: !sentNotification.ok
      ? (sentNotification.error.detail ?? sentNotification.error.message)
      : sentReceipt && !sentReceipt.ok
        ? `receipt — ${sentReceipt.error.detail ?? sentReceipt.error.message}`
        : null,
  });
}

async function record(id: string, outcome: DeliveryOutcome): Promise<DeliveryOutcome> {
  try {
    await db.contactMessage.update({
      where: { id },
      data: {
        notification: outcome.notification,
        // Left alone when no receipt was attempted. A retry must not rewrite
        // the record of a receipt that did go out at submit.
        ...(outcome.receipt === null ? {} : { receipt: outcome.receipt }),
        // The CHECK constraint requires a date on `sent`, so the two are
        // written together or not at all.
        notifiedAt: outcome.notification === "sent" ? new Date() : null,
        deliveryError: outcome.error,
      },
    });
  } catch {
    // The message is filed and the mail is out; a lost status column is the
    // cheapest possible failure here, and not worth failing a submit over.
  }
  return outcome;
}

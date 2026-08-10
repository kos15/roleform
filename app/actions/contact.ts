"use server";

import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { deliver } from "@/lib/mail/deliver";
import { SUPPORT_EMAIL } from "@/lib/mail/addresses";

/**
 * Support mail (F16).
 *
 * The contact page is public, so this is the one action in the app that runs
 * without a session. That makes the Zod schema the whole boundary: it is
 * narrow on purpose (CLAUDE.md §11 — prefer a narrow schema over a permissive
 * one plus a runtime check), and the CHECK constraint behind it refuses a
 * message nobody could answer.
 *
 * **Store first, then send.** The row is the durable record and the mail is a
 * convenience on top of it. A provider outage therefore costs us a notification,
 * never a message: the row is already written, the admin inbox still shows it,
 * and the row carries why the send failed.
 *
 * What the sender is told tracks what actually happened. "We'll reply to you"
 * when the receipt went out; "it's filed" when mail isn't configured or the
 * provider refused. A form that says "sent" while dropping the message on the
 * floor would be worse than no form — and so would one that claims an email we
 * know never left.
 */

const ContactSchema = z.object({
  name: z.string().trim().min(1, "Tell us who you are.").max(120),
  email: z.email("That doesn't look like an address we could reply to.").max(200),
  subject: z.string().trim().min(1, "A subject line helps us route this.").max(200),
  body: z.string().trim().min(20, "A little more detail, so we can actually help.").max(5000),
});

export interface ContactState {
  status: "idle" | "sent" | "error";
  message?: string;
  /** Echoed back so the confirmation can name the address we'll reply to. */
  email?: string;
  /**
   * Whether a receipt actually reached that address. The confirmation says one
   * thing or the other; it never says "check your inbox" on a message we
   * couldn't send.
   */
  receipted?: boolean;
}

export async function sendContactMessage(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const parsed = ContactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const { userId } = await auth();

  // Keyed on the subject when there is one and the address when there isn't.
  // Per-instance like the rest of lib/rate-limit.ts — this stops a stuck submit
  // button and an accidental double-click, not a determined spammer.
  const limited = rateLimit(`contact:${userId ?? parsed.data.email}`, 5, 3600);
  if (!limited.allowed) {
    return {
      status: "error",
      message: `That's several messages in a row. Try again in ${limited.retryAfterSeconds}s, or write to ${SUPPORT_EMAIL}.`,
    };
  }

  let row: { id: string };
  try {
    row = await db.contactMessage.create({
      data: {
        clerkUserId: userId,
        name: parsed.data.name,
        email: parsed.data.email,
        subject: parsed.data.subject,
        body: parsed.data.body,
      },
      select: { id: true },
    });
  } catch {
    // N7: the message body is the most sensitive thing on this page and it is
    // never what failed — so the log gets nothing, and the user gets the one
    // route that works when we're broken.
    return {
      status: "error",
      message: `We couldn't file that message. Write to ${SUPPORT_EMAIL} and it will reach the same two people.`,
    };
  }

  const delivery = await deliver({ ...parsed.data, id: row.id, clerkUserId: userId });

  return { status: "sent", email: parsed.data.email, receipted: delivery.receipt === "sent" };
}

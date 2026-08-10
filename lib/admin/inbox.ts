import "server-only";
import { db } from "@/lib/db";
import type { MailDelivery } from "@/lib/generated/prisma/enums";

/**
 * The support inbox behind the admin panel (F16).
 *
 * The row is the durable record of a contact message and the mail is a
 * convenience on top of it (lib/mail/deliver.ts). This is the read path for the
 * row — which means it is the path that still works when the mail provider is
 * down, when a key expires, or when nobody set one up. That is the whole reason
 * it exists.
 *
 * Admin-only, and gated in the page and in every action that writes here. The
 * bodies are other people's words, so nothing in this module is cached, logged
 * or joined to a profile (N7).
 */

export interface InboxMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  body: string;
  /** Formatted server-side — a client-side locale would hydrate differently. */
  received: string;
  /** Opaque Clerk subject when the sender was signed in, never an address. */
  clerkUserId: string | null;
  notification: MailDelivery;
  receipt: MailDelivery;
  deliveryError: string | null;
  handled: boolean;
  handledAt: string | null;
}

/** Newest first, unhandled ahead of handled — an inbox, not an archive. */
export async function listContactMessages(limit = 100): Promise<InboxMessage[]> {
  const rows = await db.contactMessage.findMany({
    orderBy: [{ handledAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    subject: row.subject,
    body: row.body,
    received: format(row.createdAt),
    clerkUserId: row.clerkUserId,
    notification: row.notification,
    receipt: row.receipt,
    deliveryError: row.deliveryError,
    handled: row.handledAt !== null,
    handledAt: row.handledAt ? format(row.handledAt) : null,
  }));
}

export interface InboxCounts {
  unhandled: number;
  /** Filed but never mailed to us. These are the ones only this page will show. */
  undelivered: number;
}

export async function inboxCounts(): Promise<InboxCounts> {
  const [unhandled, undelivered] = await Promise.all([
    db.contactMessage.count({ where: { handledAt: null } }),
    db.contactMessage.count({ where: { notification: { not: "sent" } } }),
  ]);
  return { unhandled, undelivered };
}

function format(date: Date): string {
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

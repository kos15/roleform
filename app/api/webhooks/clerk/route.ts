import { headers } from "next/headers";
import { Webhook } from "svix";
import { db } from "@/lib/db";
import { hashEmail } from "@/lib/auth";
import { deleteEverythingFor } from "./delete";

/**
 * Clerk user lifecycle (specs §14). The only route handler that isn't a stream.
 *
 * Signature verification is not optional — this endpoint is public, and it
 * creates and deletes user records.
 *
 * We store a HASH of the email, never the address (N7). It is enough to
 * de-duplicate and to support the user if they write in; it is not enough to
 * leak a mailing list.
 */
export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) return new Response("webhook secret not configured", { status: 500 });

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("missing svix headers", { status: 400 });
  }

  const body = await request.text();

  let event: { type: string; data: Record<string, unknown> };
  try {
    event = new Webhook(secret).verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof event;
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  const clerkUserId = String(event.data.id ?? "");
  if (!clerkUserId) return new Response("missing user id", { status: 400 });

  if (event.type === "user.created") {
    const emails = event.data.email_addresses as Array<{ email_address: string }> | undefined;
    const email = emails?.[0]?.email_address ?? "";
    await db.user.upsert({
      where: { clerkUserId },
      create: { clerkUserId, emailHash: hashEmail(email) },
      update: {},
    });
  }

  if (event.type === "user.deleted") {
    await deleteEverythingFor(clerkUserId);
  }

  if (event.type === "user.updated") {
    const emails = event.data.email_addresses as Array<{ email_address: string }> | undefined;
    const email = emails?.[0]?.email_address;
    if (email) {
      // updateMany, not update: Clerk does not guarantee event order, and a
      // `user.updated` arriving before `user.created` must not 500 into an
      // endless retry loop. Zero rows matched is a fine outcome here.
      await db.user.updateMany({
        where: { clerkUserId },
        data: { emailHash: hashEmail(email) },
      });
    }
  }

  return new Response(null, { status: 204 });
}

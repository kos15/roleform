import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { Webhook } from "svix";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
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
    await db
      .insert(users)
      .values({
        clerkUserId,
        emailHash: createHash("sha256").update(email.toLowerCase()).digest("hex"),
      })
      .onConflictDoNothing();
  }

  if (event.type === "user.deleted") {
    await deleteEverythingFor(clerkUserId);
  }

  if (event.type === "user.updated") {
    const emails = event.data.email_addresses as Array<{ email_address: string }> | undefined;
    const email = emails?.[0]?.email_address;
    if (email) {
      await db
        .update(users)
        .set({ emailHash: createHash("sha256").update(email.toLowerCase()).digest("hex") })
        .where(eq(users.clerkUserId, clerkUserId));
    }
  }

  return new Response(null, { status: 204 });
}

import { headers } from "next/headers";
import { Webhook } from "svix";
import { db } from "@/lib/db";
import { hashEmail } from "@/lib/auth";
import { workspaceDefaults } from "@/lib/admin/defaults";
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
    // The workspace defaults apply here too — this and `provisionUser` are the
    // two doors into a new account, and they have to agree about what a new
    // account starts with (lib/admin/defaults.ts).
    const defaults = await workspaceDefaults();
    await db.user.upsert({
      where: { clerkUserId },
      create: {
        clerkUserId,
        emailHash: hashEmail(email),
        // The cycle anchor (F15, F19). Without it every read of `cycleStart`
        // falls back to `now`, usage counts from this instant, and no cap
        // binds — the meter and the four caps become decorative. Written once,
        // at creation, and never moved: it is a fixed point the 30-day windows
        // are laid out around, not a date a scheduler has to maintain.
        quotaResetsAt: new Date(),
        capAnalyses: defaults.analyses,
        capResumes: defaults.resumes,
        capAnswers: defaults.answers,
        capCourses: defaults.courses,
      },
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

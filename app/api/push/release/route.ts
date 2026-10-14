import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Forget this device after sign-out (F29.2).
 *
 * Signing out of a shared phone must stop that member's reminders reaching it,
 * but by the time the browser notices the sign-out there is no session left to
 * authenticate a Server Action. So the device proves possession instead: it
 * sends its endpoint AND the subscription's `auth` secret — 16 random bytes the
 * browser generated and only the device and our database hold. A row is
 * deleted only when both match. Nothing else can be done here: no lookup, no
 * send, and the answer is 204 either way, so it says nothing about whether a
 * row existed.
 *
 * Public in middleware.ts (no session by design); rate limited per IP.
 */
export const dynamic = "force-dynamic";

const Body = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2048),
  auth: z.string().min(1).max(64),
});

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`pushrelease:${ip}`, 30, 600).allowed) return new Response(null, { status: 429 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });

  const row = await db.pushSubscription.findUnique({
    where: { endpoint: parsed.data.endpoint },
    select: { id: true, auth: true },
  });
  if (row && same(row.auth, parsed.data.auth)) {
    await db.pushSubscription.deleteMany({ where: { id: row.id } });
  }
  return new Response(null, { status: 204 });
}

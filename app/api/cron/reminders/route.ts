import { timingSafeEqual } from "node:crypto";
import { dispatchDueReminders } from "@/lib/push/dispatch";

/**
 * Sends the interview-round reminders that have come due (F29).
 *
 * Called by a machine with no session — Supabase pg_cron by default
 * (scripts/schedule-reminders.ts), or Vercel Cron on a plan that allows a
 * sub-daily schedule. Both send `Authorization: Bearer $CRON_SECRET`, and that
 * header is what stands in for the session: it is checked before anything is
 * read. Unset CRON_SECRET refuses everything rather than running open.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function handle(request: Request) {
  if (!authorised(request)) return new Response("unauthorised", { status: 401 });
  const summary = await dispatchDueReminders();
  return Response.json(summary);
}

export const GET = handle;
export const POST = handle;

import { cronAuthorised } from "@/lib/services/cron";
import { dispatchDueReminders } from "@/lib/services/push/dispatch";
import { processOutbox } from "@/lib/services/push/outbox";

/**
 * Sends the interview-round reminders that have come due (F29).
 *
 * Called by a machine with no session — Supabase pg_cron by default
 * (scripts/db/schedule.ts), or Vercel Cron on a plan that allows a
 * sub-daily schedule. Both send `Authorization: Bearer $CRON_SECRET`, and that
 * header is what stands in for the session: it is checked before anything is
 * read. Unset CRON_SECRET refuses everything rather than running open.
 *
 * Two steps (F29.2): queue the reminders that came due into the push outbox,
 * then drain the outbox — which also retries anything an earlier call left
 * waiting on a 429, a 5xx or a timeout. This is the only route that sends to
 * arbitrary members, and it sends only what business rows put in the outbox:
 * there is no "send this text to that user" endpoint anywhere.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  if (!cronAuthorised(request)) return new Response("unauthorised", { status: 401 });
  const reminders = await dispatchDueReminders();
  const push = await processOutbox({ limit: 200 });
  return Response.json({ ...reminders, push });
}

export const GET = handle;
export const POST = handle;

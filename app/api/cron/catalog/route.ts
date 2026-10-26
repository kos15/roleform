import { cronAuthorised } from "@/lib/services/cron";
import { refreshDueLinks } from "@/lib/services/learning/refresh-catalog";

/**
 * Daily link re-check of the course catalog (N24).
 *
 * Called by a machine with no session — Supabase pg_cron
 * (scripts/db/schedule.ts). It sends `Authorization: Bearer $CRON_SECRET`,
 * and that header is checked before anything is read; unset CRON_SECRET
 * refuses everything. Stops claiming new links at 200 s so the run finishes
 * inside maxDuration. Logs and returns counts only — no URL, no title (N7).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: Request): Promise<Response> {
  if (!cronAuthorised(request)) return new Response("unauthorised", { status: 401 });
  try {
    const summary = await refreshDueLinks({ limit: 150, claimUntil: Date.now() + 200_000 });
    return Response.json(summary, { status: summary.rebuilt === "failed" ? 500 : 200 });
  } catch {
    // No error object, no message: a Prisma error can carry row data (N7).
    console.error("[cron:catalog] failed");
    return new Response("failed", { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;

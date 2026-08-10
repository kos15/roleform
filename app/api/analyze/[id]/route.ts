import { auth } from "@clerk/nextjs/server";
import { runAnalysis } from "@/lib/pipeline/run-analysis";
import { getAnalysis } from "@/lib/db/queries/analysis";
import { checkTokenAllowance } from "@/lib/auth";
import { db } from "@/lib/db";
import type { StageUpdate } from "@/lib/pipeline/stages";

/**
 * The streamed pipeline (F3).
 *
 * A route handler rather than a Server Action because the parsing screen shows
 * real per-stage state as it happens — CLAUDE.md §13 allows route handlers for
 * exactly this and for webhooks.
 *
 * Each line is one JSON StageUpdate (NDJSON). A stage failure emits its own
 * update and ends the stream; nothing here pretends progress it hasn't made.
 */
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return new Response("unauthenticated", { status: 401 });

  const { id } = await params;
  const analysis = await getAnalysis(userId, id);
  if (!analysis) return new Response("not found", { status: 404 });

  // Re-running a finished analysis would re-bill it (F10). Reuse instead.
  if (analysis.status === "ready") {
    return new Response(
      `${JSON.stringify({ stage: "preparing", state: "done", progressPct: 100 } satisfies StageUpdate)}\n`,
      { headers: STREAM_HEADERS },
    );
  }

  // The meter, at the door the pipeline actually runs through (F19).
  //
  // `createAnalysis` already checked it, and this checks it again — not out of
  // caution, but because they guard different things. That one decides whether
  // a posting gets filed at all; this one is what a parked run, a reloaded tab
  // and a retried request all have to pass, and it is the only check between a
  // `parsing` row and four billed model calls.
  //
  // 402 with the wall as JSON rather than an NDJSON stage failure: this is not
  // a stage that broke, it is a run that never started, and the client opens
  // the dialog rather than printing "a stage failed".
  const tokens = await checkTokenAllowance(userId, "analysis");
  if (!tokens.ok) {
    return Response.json({ error: tokens.error }, { status: 402 });
  }

  // Starting clears the parked stamp: from here the run is a run like any
  // other, and a queue entry that outlived its own start would keep offering
  // to begin something already underway.
  if (analysis.queuedAt) {
    await db.analysis.updateMany({
      where: { id, clerkUserId: userId },
      data: { queuedAt: null },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (update: StageUpdate) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(update)}\n`));
      };
      try {
        await runAnalysis({ clerkUserId: userId, analysisId: id, emit });
      } catch (e) {
        // N7: the shape of the failure, never the document.
        console.error(`[analyze] error=${e instanceof Error ? e.name : "unknown"}`);
        emit({
          stage: "reading",
          state: "failed",
          progressPct: 0,
          message: "Something failed partway through. Your completed stages were kept.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: STREAM_HEADERS });
}

const STREAM_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  "X-Accel-Buffering": "no",
};

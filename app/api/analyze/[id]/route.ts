import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { RUN_LOCK_STALE_MS, runAnalysis } from "@/lib/services/pipeline/run-analysis";
import { getAnalysis } from "@/lib/db/queries/analysis";
import { checkTokenAllowance } from "@/lib/services/auth";
import { db } from "@/lib/db";
import type { StageUpdate } from "@/lib/services/pipeline/stages";

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
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return new Response("unauthenticated", { status: 401 });

  const { id } = await params;
  const analysis = await getAnalysis(userId, id);
  if (!analysis) return new Response("not found", { status: 404 });

  const search = new URL(request.url).searchParams;

  // Re-running a finished analysis would re-bill it (F10). Reuse instead.
  //
  // `?resume=1` is the one exception: a Prep tab whose background stage never
  // landed (the invocation was killed after the drafts were written, or the
  // stage degraded) asking for just that stage. `runAnalysis` skips every
  // stage whose rows exist (`resumeState`), so this bills the missing stage
  // and nothing else.
  if (analysis.status === "ready" && search.get("resume") !== "1") {
    return new Response(
      `${JSON.stringify({ stage: "preparing", state: "done", progressPct: 100 } satisfies StageUpdate)}\n`,
      { headers: STREAM_HEADERS },
    );
  }

  // `?reconnect=1` is the parsing screen picking a dropped stream back up
  // (a phone that locked mid-run, a network blip). It wants to know how the
  // run it was watching ended — not to start another. A run that failed says
  // so here, and the member decides whether to pick it up again, exactly as
  // after a reload.
  const reconnect = search.get("reconnect") === "1";
  if (reconnect && analysis.status === "failed") {
    return new Response(
      `${JSON.stringify({
        stage: "reading",
        state: "failed",
        progressPct: 0,
        message: analysis.scoreNote ?? "This analysis didn't finish.",
      } satisfies StageUpdate)}\n`,
      { headers: STREAM_HEADERS },
    );
  }

  // A run another invocation is still driving is followed, not started
  // (`runAnalysis` → `followExistingRun`), so it bills nothing here. Checking
  // the meter anyway would read a balance this very run is in the middle of
  // spending, and could raise the wall over a run that is already paid for.
  const liveRun =
    analysis.runningAt !== null && analysis.runningAt.getTime() > Date.now() - RUN_LOCK_STALE_MS;

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
  if (!liveRun) {
    const tokens = await checkTokenAllowance(userId, "analysis");
    if (!tokens.ok) {
      return Response.json({ error: tokens.error }, { status: 402 });
    }
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

  // The stream is how the member watches the run, not what keeps it alive.
  // Before, the pipeline ran inside the stream's `start` and wrote straight to
  // its controller — so a closed tab, a locked phone or a dropped connection
  // made the next `enqueue` throw, and that throw tore down whichever stage
  // happened to be running. The run died because its audience left.
  //
  // Now `emit` is a no-op once nobody is listening, and the run is handed to
  // `after()` so the platform keeps the invocation alive (up to maxDuration)
  // until it finishes. A member who comes back finds it done, or still going
  // and followable — never half-written because they looked away.
  let controller = null as ReadableStreamDefaultController<Uint8Array> | null;
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      open = false;
    },
  });

  const emit = (update: StageUpdate) => {
    if (!open || !controller) return;
    try {
      controller.enqueue(encoder.encode(`${JSON.stringify(update)}\n`));
    } catch {
      open = false;
    }
  };

  const run = (async () => {
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
      if (open) {
        open = false;
        try {
          controller?.close();
        } catch {
          // Already closed by the client going away.
        }
      }
    }
  })();
  after(run);

  return new Response(stream, { headers: STREAM_HEADERS });
}

const STREAM_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  "X-Accel-Buffering": "no",
};

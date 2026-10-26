"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorRegion } from "@/components/ui";
import { WaitOverlay } from "@/components/wait-overlay";
import { TokenWallDialog } from "@/components/token-wall";
import { STAGES, parsingFinished, type StageKey, type StageState, type StageUpdate } from "@/lib/services/pipeline/stages";
import type { AppError } from "@/lib/domain/types";
import type { TokenWall } from "@/lib/domain/tokens";

/**
 * F3 — the parsing screen.
 *
 * Named steps resolving in sequence against REAL state streamed from the
 * pipeline. Never a fake timer: a spinner that lies is worse than an error, so
 * a stage failure stops there and says what failed.
 *
 * One animation — the galaxy card — follows the stage the pipeline says is
 * running, and the screen leaves for the results the moment the score exists.
 * Drafts, Prep and Learning finish behind them, each tab showing its own loader
 * (lib/services/pipeline/run-analysis.ts).
 */
/** Quiet reconnects after a dropped stream, before the screen says anything. */
const RECONNECTS = 3;

export function ParsingScreen({
  analysisId,
  initialStatus,
  note,
}: {
  analysisId: string;
  initialStatus: "parsing" | "ready" | "failed";
  note: string | null;
}) {
  const router = useRouter();
  const started = useRef(false);
  const [progressPct, setProgressPct] = useState(0);
  const [states, setStates] = useState<Record<StageKey, StageState>>({
    reading: "pending",
    matching: "pending",
    rewriting: "pending",
    preparing: "pending",
  });
  const [messages, setMessages] = useState<Partial<Record<StageKey, string>>>({});
  const [failed, setFailed] = useState<string | null>(
    initialStatus === "failed" ? (note ?? "This analysis didn't finish.") : null,
  );
  const [wall, setWall] = useState<TokenWall | null>(null);
  const [dismissed, setDismissed] = useState(false);
  // Bumped to ask the pipeline again after a top-up. The ref guard stops the
  // effect firing twice per attempt; this is what makes a second attempt a
  // different attempt rather than a re-render.
  const [attempt, setAttempt] = useState(0);
  // The run's last word was success: the card plays its finish, then we go.
  const [finishing, setFinishing] = useState(false);

  // A run that arrived already failed does not restart itself — that would bill
  // a member for reloading a page. It restarts when they ask, which is what
  // bumping `attempt` from the resume button means.
  useEffect(() => {
    if (started.current || (initialStatus === "failed" && attempt === 0)) return;
    started.current = true;

    const controller = new AbortController();
    // The stream's own record of whether a stage failed. `failed` is React
    // state and this closure would still read `null` after setting it, so the
    // redirect below would fire over the error screen it just raised.
    let stageFailed = false;

    // Whether the stream carried the run's last word. A stream can also just
    // stop — a phone locking, a network blip, the platform cutting a long
    // response — and before this, a stream that stopped without a failure was
    // read as success: the screen pushed to results for a run still parsing.
    let finished = false;

    /**
     * One connection to the pipeline route. "dropped" is the only outcome
     * worth another connection: the run keeps going server-side without us
     * (the route hands it to `after()`), so reconnecting follows it rather
     * than starting it again.
     */
    const connect = async (reconnect: boolean): Promise<"done" | "dropped" | "refused"> => {
      let response: Response;
      try {
        response = await fetch(`/api/analyze/${analysisId}${reconnect ? "?reconnect=1" : ""}`, {
          method: "POST",
          signal: controller.signal,
        });
      } catch {
        return "dropped";
      }

      // 402: the run never started, so this is not a stage that failed. The
      // pipeline refuses before stage one rather than half-running (F19), and
      // the dialog is what the member gets instead of a progress bar that
      // stops at 0%.
      if (response.status === 402) {
        const body = (await response.json().catch(() => ({}))) as { error?: AppError };
        // Another attempt is a legitimate thing to want after topping up.
        started.current = false;
        if (body.error?.wall) setWall(body.error.wall);
        else setFailed(body.error?.message ?? "We couldn't start the analysis.");
        return "refused";
      }

      // Anything else that isn't a stream says nothing about the run itself:
      // a 5xx, a gateway timeout, or — most often after a phone wakes — a
      // session token that expired while the tab slept, which middleware
      // answers with 401/404 until Clerk refreshes it a moment later.
      if (!response.ok || !response.body) return "dropped";

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const apply = (line: string) => {
        if (!line.trim()) return;
        let update: StageUpdate;
        try {
          update = JSON.parse(line) as StageUpdate;
        } catch {
          // One unreadable line is not worth failing a run the server is
          // still driving. The next update carries the whole state anyway.
          return;
        }
        if (!update || typeof update !== "object" || !STAGES.some((s) => s.key === update.stage)) return;
        setProgressPct(update.progressPct);
        setStates((prev) => ({ ...prev, [update.stage]: update.state }));
        if (update.message) {
          setMessages((prev) => ({ ...prev, [update.stage]: update.message! }));
        }
        if (update.state === "failed") {
          stageFailed = true;
          setFailed(update.message ?? "A stage failed.");
        }
        // The run is `ready` before it announces matching done, so the score
        // and buckets exist the moment this fires. A followed or already-
        // finished run reports stage ④ at 100% instead (see parsingFinished).
        if (parsingFinished(update)) finished = true;
      };

      try {
        // Stops reading once the results are ready. Cancelling only closes
        // our view of the stream: the run itself is held open by `after()` on
        // the server and finishes the drafts, Prep and Learning without an audience.
        while (!finished && !stageFailed) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          lines.forEach(apply);
        }
        if (finished || stageFailed) void reader.cancel().catch(() => {});
        else apply(buffer);
      } catch {
        // Read failed mid-stream: same as the stream stopping early.
      }

      return stageFailed || finished ? "done" : "dropped";
    };

    void (async () => {
      let outcome = await connect(false);
      // A couple of quiet reconnects before saying anything. Each one costs a
      // short wait and nothing else: the route follows a run that is still
      // going, and reports one that ended either way.
      for (let tries = 0; outcome === "dropped" && tries < RECONNECTS; tries++) {
        if (controller.signal.aborted) return;
        await new Promise((resolve) => setTimeout(resolve, 2_000 * (tries + 1)));
        if (controller.signal.aborted) return;
        outcome = await connect(true);
      }
      if (controller.signal.aborted || outcome === "refused") return;

      if (outcome === "dropped") {
        started.current = false;
        setFailed(
          "We lost the connection to this run. It may still be finishing — pick it up again to check, nothing finished is charged twice.",
        );
        return;
      }

      // Only a run that finished goes to the results. A failed one stays here,
      // where the stage that broke is named and the resume button is.
      if (stageFailed || !finished) {
        started.current = false;
        router.refresh();
        return;
      }

      // Straight to the results. The card's finish used to hold the page for
      // a further 1.4s after the work was already done.
      setFinishing(true);
      router.replace(`/analysis/${analysisId}/resumes`);
    })().catch(() => {
      started.current = false;
      setFailed("The connection dropped partway through.");
    });

    return () => controller.abort();
  }, [analysisId, initialStatus, router, attempt]);

  if (wall) {
    return (
      <>
        {/* Dismissing the dialog leaves the page behind it, which still says
            what happened. A refusal you can only read once is a refusal you
            have to remember, and this one has a number in it. */}
        {dismissed ? null : (
          <TokenWallDialog
            wall={wall}
            onClose={() => setDismissed(true)}
            onResume={() => {
              setWall(null);
              setDismissed(false);
              setAttempt((n) => n + 1);
            }}
            resumeLabel="Start the analysis"
          />
        )}
        <div className="max-w-[760px] space-y-5">
          <h1 className="text-[clamp(2.75rem,5.5vw,5rem)] leading-[0.92]">
            This run is waiting for your limit to reset
          </h1>
          <p className="text-[15px] leading-relaxed text-[var(--color-text-muted)] sm:text-[17px]">
            The posting is saved. Nothing has run and nothing has been charged.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDismissed(false)}>Show my options</Button>
            <Button variant="secondary" onClick={() => router.push("/analyze")}>
              Back to the analyse screen
            </Button>
          </div>
        </div>
      </>
    );
  }

  if (failed) {
    return (
      <div className="max-w-[760px] space-y-5">
        <h1 className="text-[clamp(2.75rem,5.5vw,5rem)] leading-[0.92]">This analysis stopped</h1>
        <ErrorRegion title="What failed">{failed}</ErrorRegion>
        <p className="text-sm text-[var(--color-text-muted)]">
          Whatever finished before the failure was kept — we resume rather than restart. Picking it
          up again starts at the first stage with nothing to show for it, and the stages that
          already ran are not charged for twice.
        </p>
        <div className="flex flex-wrap gap-2">
          {/* Without this the failed screen was a dead end: the only way on was
              a different posting.

              The sentence above is now enforced rather than asserted —
              `runAnalysis` consults `resumeState` before every stage and
              returns early where the rows already exist. Read that before
              changing this label back to "restart". */}
          <Button
            onClick={() => {
              setFailed(null);
              setAttempt((n) => n + 1);
            }}
          >
            Pick it up again
          </Button>
          <Button variant="secondary" onClick={() => router.push("/analyze")}>
            Try another posting
          </Button>
        </div>
      </div>
    );
  }

  // The running stage, or the last one that finished — never "none", so the
  // card's pips don't blank out between two stream updates.
  const current =
    STAGES.find((s) => states[s.key] === "running") ??
    [...STAGES].reverse().find((s) => states[s.key] !== "pending") ??
    STAGES[0];
  // The screen leaves once the score exists, so the card counts down to it:
  // the drafts, Prep and Learning finish behind the results, under their tabs.
  const shown = STAGES.filter((s) => s.key === "reading" || s.key === "matching");
  const stageIndex = Math.min(STAGES.indexOf(current), shown.length - 1);

  // One animation for one task. The galaxy card is the whole screen while the
  // run works; the stage list, figure and progress bar that used to sit under
  // it repeated the same news three more times. A stage that comes back
  // partial says so in the card's sub-line.
  const stageNote = Object.values(messages).at(-1);

  return (
    <div aria-live="polite">
      <p className="sr-only">
        {current.label}. {progressPct}% complete.
      </p>
      <WaitOverlay
        open
        kind="galaxy"
        eyebrow={`Analysing the posting · ${progressPct}%`}
        lines={shown.map((s) => s.label)}
        stage={stageIndex}
        state={finishing ? "done" : "working"}
        sub={stageNote ?? current.description}
        still={stageNote ?? "Still going. This part reads every requirement against your own words."}
        long="Taking longer than usual. You can leave — it keeps running and waits in History."
        done="Your results are ready"
        run={attempt}
      />
    </div>
  );
}

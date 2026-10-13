"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleDashed, Loader2, TriangleAlert } from "lucide-react";
import { Button, ErrorRegion } from "@/components/ui";
import { StageFigure } from "@/components/stage-figure";
import { InfoNote } from "@/components/info-note";
import { TokenWallDialog } from "@/components/token-wall";
import { STAGES, type StageKey, type StageState, type StageUpdate } from "@/lib/pipeline/stages";
import type { AppError } from "@/lib/domain/types";
import type { TokenWall } from "@/lib/domain/tokens";

/**
 * F3 — the parsing screen.
 *
 * Four named steps resolving in sequence against REAL state streamed from the
 * pipeline. Never a fake timer: a spinner that lies is worse than an error, so
 * a stage failure stops there and says what failed.
 *
 * The heading, the description and the figure all follow the stage the pipeline
 * says is running. Nothing on this screen advances on its own.
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
        // The pipeline's last word on success is always stage ④ at 100%.
        if (update.stage === "preparing" && update.progressPct >= 100 && update.state !== "running") {
          finished = true;
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          lines.forEach(apply);
        }
        apply(buffer);
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

      router.refresh();
      router.push(`/analysis/${analysisId}/resumes`);
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
            This run is waiting on your allowance
          </h1>
          <p className="text-[17px] leading-relaxed text-[var(--color-text-muted)]">
            The posting is stored — nothing has been read, matched or rewritten, and nothing has
            been charged. It will be here when the balance is.
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
  // heading and figure don't blank out between two stream updates.
  const current =
    STAGES.find((s) => states[s.key] === "running") ??
    [...STAGES].reverse().find((s) => states[s.key] !== "pending") ??
    STAGES[0];

  return (
    <div>
      <div className="rise-in max-w-[980px]">
        <p className="eyebrow mb-3.5">Step 2 of 3 · {progressPct}% complete</p>
        <h1 className="mb-[18px] text-[clamp(2.9rem,6vw,5.75rem)] leading-[0.92]">{current.label}</h1>
        <p className="mb-7 max-w-[60ch] text-[17px] leading-relaxed text-[var(--color-text-muted)]">
          {current.description}
        </p>

        <div
          className="progress mb-8"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Analysis progress"
        >
          <span style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Not a Card: the figure needs to clip its own animation, and a card's
          shadow around a looping diagram reads as a second progress widget. */}
      <div className="mb-10 overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)] p-5 sm:p-7">
        <StageFigure stage={current.key} />
      </div>

      {/* The four stages as a row of cards: the running one in pink, the
          finished ones on paper, the ones still to come on marigold tint. */}
      <ol className="grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
        {STAGES.map((stage) => {
          const state = states[stage.key];
          const tone =
            state === "running"
              ? { card: "bg-[var(--color-sage-500)]", dot: "bg-[var(--color-sage-300)]" }
              : state === "pending"
                ? { card: "bg-[var(--color-accent-100)]", dot: "bg-[var(--color-bg-raised)]" }
                : { card: "bg-[var(--color-bg-raised)]", dot: "bg-[var(--color-bg-tint)]" };
          return (
            <li
              key={stage.key}
              className={`flex min-h-[150px] flex-col justify-between gap-4 rounded-[22px] px-5 pb-[22px] pt-[18px] ${tone.card}`}
            >
              <span className={`grid h-9 w-9 place-items-center rounded-[var(--radius-pill)] ${tone.dot}`}>
                <StageIcon state={state} />
              </span>
              <span>
                <span className="block text-[17px] font-extrabold leading-snug">{stage.label}</span>
                <span className="mt-1 block text-[15px] text-[var(--color-text-muted)]">
                  {STATUS_LABEL[state]}
                </span>
                {messages[stage.key] ? (
                  <span className="mt-1 block text-sm">{messages[stage.key]}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>

      <InfoNote className="mt-9">
        A stage that fails stops there and says what failed — we resume rather than restart.
      </InfoNote>
    </div>
  );
}

const STATUS_LABEL: Record<StageState, string> = {
  pending: "pending",
  running: "running",
  done: "done",
  degraded: "partial",
  failed: "failed",
};

function StageIcon({ state }: { state: StageState }) {
  if (state === "running") {
    return <Loader2 className="lucide h-4 w-4 animate-spin" />;
  }
  if (state === "done") {
    return <Check className="lucide h-4 w-4" strokeWidth={3.2} />;
  }
  if (state === "degraded" || state === "failed") {
    return <TriangleAlert className="lucide h-4 w-4" />;
  }
  return <CircleDashed className="lucide h-4 w-4" />;
}

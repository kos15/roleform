"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleDashed, Loader2, TriangleAlert } from "lucide-react";
import { Button, ErrorRegion } from "@/components/ui";
import { StageFigure } from "@/components/stage-figure";
import { STAGES, type StageKey, type StageState, type StageUpdate } from "@/lib/pipeline/stages";

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

  useEffect(() => {
    if (started.current || initialStatus === "failed") return;
    started.current = true;

    const controller = new AbortController();

    void (async () => {
      const response = await fetch(`/api/analyze/${analysisId}`, {
        method: "POST",
        signal: controller.signal,
      });
      if (!response.body) {
        setFailed("We couldn't start the analysis.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const update = JSON.parse(line) as StageUpdate;
          setProgressPct(update.progressPct);
          setStates((prev) => ({ ...prev, [update.stage]: update.state }));
          if (update.message) {
            setMessages((prev) => ({ ...prev, [update.stage]: update.message! }));
          }
          if (update.state === "failed") setFailed(update.message ?? "A stage failed.");
        }
      }

      router.refresh();
      router.push(`/analysis/${analysisId}/resumes`);
    })().catch(() => setFailed("The connection dropped partway through."));

    return () => controller.abort();
  }, [analysisId, initialStatus, router]);

  if (failed) {
    return (
      <div className="max-w-2xl space-y-4">
        <ErrorRegion title="This analysis stopped">{failed}</ErrorRegion>
        <p className="text-sm text-[var(--color-text-muted)]">
          Whatever finished before the failure was kept — we resume rather than restart.
        </p>
        <Button variant="secondary" onClick={() => router.push("/analyze")}>
          Try another posting
        </Button>
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
    <div className="max-w-3xl">
      <div className="rise-in">
        <p className="eyebrow mb-2.5 text-[var(--color-accent-700)]">
          Step 2 of 3 · {progressPct}% complete
        </p>
        <h1 className="mb-2 text-4xl">{current.label}</h1>
        <p className="mb-6 max-w-[60ch] text-[var(--color-text-muted)]">{current.description}</p>

        <div
          className="mb-7 h-2 w-full overflow-hidden rounded-[var(--radius-pill)]"
          style={{ background: "var(--color-bg-sunken)" }}
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Analysis progress"
        >
          <div
            className="h-full rounded-[var(--radius-pill)] transition-[width] duration-500"
            style={{ width: `${progressPct}%`, background: "var(--color-accent-500)" }}
          />
        </div>
      </div>

      {/* Not a Card: the figure needs to clip its own animation, and a card's
          shadow around a looping diagram reads as a second progress widget. */}
      <div
        className="mb-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] p-5 sm:p-6"
        style={{ background: "var(--color-bg-raised)" }}
      >
        <StageFigure stage={current.key} />
      </div>

      <ol className="mb-7">
        {STAGES.map((stage) => {
          const state = states[stage.key];
          const active = state === "running";
          return (
            <li
              key={stage.key}
              className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] py-2.5"
            >
              <StageIcon state={state} />
              <span
                className={
                  state === "pending"
                    ? "text-[var(--color-text-muted)]"
                    : active
                      ? "font-semibold"
                      : undefined
                }
              >
                {stage.label}
              </span>
              {messages[stage.key] ? (
                <span className="text-sm text-[var(--color-warn-700)]">{messages[stage.key]}</span>
              ) : null}
              <span className="ml-auto text-xs text-[var(--color-text-muted)]">
                {STATUS_LABEL[state]}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="max-w-[60ch] text-sm text-[var(--color-text-muted)]">
        A stage that fails stops there and says what failed — we resume rather than restart.
      </p>
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
    return <Loader2 className="lucide h-5 w-5 animate-spin text-[var(--color-accent-600)]" />;
  }
  if (state === "done") {
    return <Check className="lucide h-5 w-5 text-[var(--color-sage-600)]" />;
  }
  if (state === "degraded" || state === "failed") {
    return <TriangleAlert className="lucide h-5 w-5 text-[var(--color-warn-500)]" />;
  }
  return <CircleDashed className="lucide h-5 w-5 text-[var(--color-text-muted)]" />;
}

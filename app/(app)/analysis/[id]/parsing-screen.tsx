"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleDashed, Loader2, TriangleAlert } from "lucide-react";
import { Button, Card, ErrorRegion } from "@/components/ui";
import { STAGES, type StageKey, type StageState, type StageUpdate } from "@/lib/pipeline/stages";

/**
 * F3 — the parsing screen.
 *
 * Four named steps resolving in sequence against REAL state streamed from the
 * pipeline. Never a fake timer: a spinner that lies is worse than an error, so
 * a stage failure stops there and says what failed.
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

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6">Reading the posting</h1>

      <div
        className="mb-8 h-2 w-full overflow-hidden rounded-[var(--radius-pill)]"
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

      <Card>
        <ol className="space-y-4">
          {STAGES.map((stage) => {
            const state = states[stage.key];
            return (
              <li key={stage.key} className="flex items-center gap-3">
                <StageIcon state={state} />
                <span
                  className={
                    state === "pending" ? "text-[var(--color-text-muted)]" : "font-semibold"
                  }
                >
                  {stage.label}
                </span>
                {messages[stage.key] ? (
                  <span className="text-sm text-[var(--color-warn-700)]">
                    {messages[stage.key]}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}

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

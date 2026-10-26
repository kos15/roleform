"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";
import type { DraftsState } from "@/lib/services/pipeline/background";

/**
 * Drafts, Prep and Learning finish behind the score and match (lib/services/pipeline/run-analysis.ts).
 * While they do, the analysis layout mounts this poller once: a server refresh
 * every few seconds re-reads the rows, so the tab counts and any tab showing
 * `SectionPending` fill in on their own and the poller unmounts itself once
 * `backgroundRunning` turns false.
 *
 * `router.refresh()` keeps client state — an open preview, a half-typed
 * answer — so polling under the reader costs nothing they can see.
 */
const POLL_MS = 3_000;

export function BackgroundRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}

/**
 * A tab whose rows are still being written. One quiet spinner — the analysis
 * already played its one animation — and a sentence saying what is coming.
 */
export function SectionPending({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Card flat className="flex items-start gap-4" role="status" aria-live="polite">
      <Loader2 className="lucide mt-1 h-5 w-5 shrink-0 animate-spin" aria-hidden />
      <div>
        <h3 className="mb-1.5">{title}</h3>
        {children ? <p className="text-[var(--color-text-muted)]">{children}</p> : null}
      </div>
    </Card>
  );
}

/**
 * Picks up a background stage that never landed — the invocation was killed
 * after the drafts were written, or the stage degraded. The pipeline skips
 * every stage whose rows already exist (`resumeState`), so only the missing
 * one runs, and the meter is checked at the door like any other run (F19).
 */
export function ResumeStageButton({ analysisId, label }: { analysisId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resume() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/analyze/${analysisId}?resume=1`, { method: "POST" });
      if (response.status === 402) {
        const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(body.error?.message ?? "Your limit is used up for now.");
        return;
      }
      // Once the run holds its claim, the layout sees it as generating and
      // swaps this tab for its loader — the button need not stay on screen.
      setTimeout(() => router.refresh(), 1_500);
      // Drained, not parsed: the tab re-reads its rows when the run ends.
      if (response.body) {
        const reader = response.body.getReader();
        while (!(await reader.read()).done) {
          // keep reading until the run closes the stream
        }
      }
      router.refresh();
    } catch {
      setError("We couldn’t reach Roleform. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 flex flex-col items-center gap-2">
      <Button onClick={resume} busy={busy} disabled={busy}>
        {label}
      </Button>
      {error ? <p className="text-sm text-[var(--color-text-muted)]">{error}</p> : null}
    </div>
  );
}

/**
 * The Résumés tab and the preview when no draft exists yet. Which of the three
 * it is comes from `draftsState`; the copy never names a count (§5).
 *
 * "Finish the drafts" asks only for stage ③ (`?resume=1`) and is offered only
 * where that is possible: `canResume` is false for an analysis that is not
 * `ready`, which shows the empty state alone.
 */
export function DraftsPlaceholder({
  state,
  analysisId,
  canResume = true,
}: {
  state: Exclude<DraftsState, "ready">;
  analysisId: string;
  canResume?: boolean;
}) {
  if (state === "pending") {
    return (
      <SectionPending title="Writing your drafts">
        Your match is ready now. The drafts are still being written from your own bullets — this
        tab fills in on its own.
      </SectionPending>
    );
  }
  if (state === "off") {
    return (
      <EmptyState title="Drafts are off for your account">
        Your match, Prep and Learning are unaffected.
      </EmptyState>
    );
  }
  return (
    <>
      <EmptyState title="The drafts didn't finish">
        Your match and the other tabs are unaffected. Finishing them runs only what&rsquo;s missing —
        nothing that already finished is charged twice.
      </EmptyState>
      {canResume ? <ResumeStageButton analysisId={analysisId} label="Finish the drafts" /> : null}
    </>
  );
}

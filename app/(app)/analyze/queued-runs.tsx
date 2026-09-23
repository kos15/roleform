"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { Button, ErrorRegion } from "@/components/ui";
import { TokenWallDialog } from "@/components/token-wall";
import { discardQueuedAnalysis, startQueuedAnalysis } from "@/app/actions/analysis";
import type { TokenWall } from "@/lib/domain/tokens";

export interface QueuedRunView {
  id: string;
  label: string;
  queued: string;
}

/**
 * Postings parked against the token wall (F19).
 *
 * This is the whole "queue". There is no worker and no cron (CLAUDE.md §8), so
 * a parked run waits here with a button rather than starting itself at
 * midnight. Saying that plainly is better than a scheduler we would have to
 * build, monitor, and apologise for — and the member loses nothing except the
 * one click, because the posting text was kept.
 *
 * Starting re-checks the balance. If it is still short, the same dialog opens
 * again: the wall is never bypassed by having been queued.
 */
export function QueuedRuns({ runs }: { runs: QueuedRunView[] }) {
  const router = useRouter();
  const [wall, setWall] = useState<TokenWall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (runs.length === 0) return null;

  function start(id: string) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await startQueuedAnalysis(id);
      setPendingId(null);
      if (!result.ok) {
        if (result.error.code === "token_wall" && result.error.wall) setWall(result.error.wall);
        else setError(result.error.message);
        return;
      }
      router.push(`/analysis/${id}`);
    });
  }

  function discard(id: string) {
    setPendingId(id);
    startTransition(async () => {
      await discardQueuedAnalysis(id);
      setPendingId(null);
      router.refresh();
    });
  }

  return (
    <div
      className="rise-in mb-7 rounded-[var(--radius-lg)] bg-[var(--color-accent-500)] p-6"
    >
      {wall ? <TokenWallDialog wall={wall} onClose={() => setWall(null)} /> : null}

      <div className="mb-2.5 flex items-center gap-2.5">
        <Clock className="lucide h-4 w-4 text-[var(--color-text)]" />
        <span className="eyebrow text-[var(--color-text)]">
          {runs.length === 1 ? "One posting is waiting" : `${runs.length} postings are waiting`}
        </span>
      </div>

      <p className="mb-4 max-w-[62ch] text-sm leading-relaxed text-[var(--color-text)]">
        Parked when your allowance ran out. Nothing has been read, matched or rewritten, and nothing
        has been charged — these start when you say so, not on a timer.
      </p>

      {error ? <ErrorRegion title="That didn't start">{error}</ErrorRegion> : null}

      <ul className="flex list-none flex-col gap-2 p-0">
        {runs.map((run) => (
          <li
            key={run.id}
            className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg-raised)] px-4 py-3"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-extrabold">{run.label}</span>
              <span className="block text-xs text-[var(--color-text-muted)]">
                Parked {run.queued}
              </span>
            </span>
            <Button
              size="sm"
              onClick={() => start(run.id)}
              disabled={pendingId === run.id}
              busy={pendingId === run.id}
            >
              {pendingId === run.id ? "Starting…" : "Run it now"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => discard(run.id)}
              disabled={pendingId === run.id}
            >
              Discard
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

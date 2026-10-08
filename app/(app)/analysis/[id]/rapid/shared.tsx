"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ErrorRegion } from "@/components/ui";
import { TokenWallDialog } from "@/components/token-wall";
import type { TokenWall } from "@/lib/domain/tokens";
import type { Result } from "@/lib/domain/types";

/**
 * F26 — the pieces all three rapid-prep modes share: a labelled choice row in
 * the DS `.seg`, a clock, and the one way a paid action reports its refusal
 * (the token wall opens; anything else is an inline error, never a toast).
 */

export function Choice<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="eyebrow mb-2">{label}</p>
      <div className="seg seg-wrap" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            aria-selected={o.value === value}
            disabled={disabled}
            title={o.hint}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Seconds left until `endsAt` (ms), ticking once a second. Negative once over. */
export function useCountdown(endsAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  return endsAt === null ? null : Math.round((endsAt - now) / 1000);
}

export function formatClock(seconds: number): string {
  const s = Math.abs(seconds);
  const m = Math.floor(s / 60);
  return `${seconds < 0 ? "+" : ""}${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Runs a paid server action. A token wall opens the shared dialog with a
 * resume that re-runs the same call; every other refusal is an inline error.
 */
export function usePaidAction<T>() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [wall, setWall] = useState<{ wall: TokenWall; retry: () => void } | null>(null);

  const run = useCallback((call: () => Promise<Result<T>>, onOk: (value: T) => void) => {
    setError(null);
    const attempt = () =>
      startTransition(async () => {
        const result = await call();
        if (result.ok) onOk(result.value);
        else if (result.error.code === "token_wall" && result.error.wall) {
          setWall({ wall: result.error.wall, retry: attempt });
        } else setError(result.error.message);
      });
    attempt();
  }, []);

  const feedback = (
    <>
      {wall ? (
        <TokenWallDialog
          wall={wall.wall}
          onClose={() => setWall(null)}
          onResume={() => {
            const retry = wall.retry;
            setWall(null);
            retry();
          }}
          resumeLabel="Try again"
        />
      ) : null}
      {error ? <ErrorRegion title="That didn't work">{error}</ErrorRegion> : null}
    </>
  );

  return { pending, run, feedback, setError };
}

/** `backticks` in model or bank prose rendered as inline code. Nothing else is parsed. */
export function Prose({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <p className={className}>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <code key={i} className="code-inline">
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

const PERIOD = 30;
/** 2πr for r = 22, the ring drawn below. */
const CIRCUMFERENCE = 138;

/**
 * The status page re-reads itself every 30 seconds, and shows the countdown so
 * the number on screen has a known age.
 *
 * A status page that silently goes stale is the worst kind: it looks like a
 * live instrument and behaves like a screenshot. The ring is the honest part —
 * it says how long ago this was true.
 */
export function RefreshRing() {
  const router = useRouter();
  const [left, setLeft] = useState(PERIOD);

  useEffect(() => {
    const tick = setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          router.refresh();
          return PERIOD;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [router]);

  const swept = ((PERIOD - left) / PERIOD) * CIRCUMFERENCE;

  return (
    <div className="flex min-w-[250px] flex-1 basis-60 items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--color-line)] p-5">
      <div className="relative h-[78px] w-[78px] flex-none">
        <svg width="78" height="78" viewBox="0 0 78 78" aria-hidden>
          <circle
            cx="39"
            cy="39"
            r="22"
            fill="none"
            stroke="var(--color-bg-sunken)"
            strokeWidth="8"
          />
          <circle
            cx="39"
            cy="39"
            r="22"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${swept.toFixed(0)} ${CIRCUMFERENCE}`}
            transform="rotate(-90 39 39)"
            style={{ transition: "stroke-dasharray 900ms linear" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center font-[family-name:var(--font-heading)] text-lg tabular-nums">
          {left}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 text-[0.9rem] font-semibold">Re-reading automatically</div>
        <p className="mb-3 text-xs leading-snug text-[var(--color-text-muted)]">
          No need to keep this open. A parked run resumes on its own.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setLeft(PERIOD);
            router.refresh();
          }}
        >
          Check now
        </Button>
      </div>
    </div>
  );
}

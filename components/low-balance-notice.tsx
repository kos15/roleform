"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * The one-time low-count warning (F19, counts-only pricing).
 *
 * The single moment we interrupt to say a printed count is nearly used — one
 * analysis, answer draft or practice session left, or none. **Once per cycle.** A banner that reappeared
 * on every page load would be the nagging the pill exists to avoid, and the
 * member would learn to dismiss it without reading, which is worse than not
 * having warned them.
 *
 * Dismissal is keyed on the cycle's own reset date, so next cycle's warning is
 * a different warning and shows again. Client-side because it is a per-browser
 * courtesy, not account state — remembering it server-side would mean a write
 * on a read path to record that somebody closed a box.
 */
export function LowBalanceNotice({
  noticeKey,
  text,
  resetDate,
  empty,
}: {
  /** Which count — so a later warning about a different one still shows. */
  noticeKey: string;
  /** The sentence, already in counts (lib/domain/quotas.ts#lowCountNotice). */
  text: string;
  resetDate: string;
  /** None left. Changes the verb, not the design. */
  empty: boolean;
}) {
  const key = `roleform-lowcount:${resetDate}:${noticeKey}:${empty ? "empty" : "low"}`;
  // Starts hidden and is revealed by the effect. Rendering it on the server and
  // pulling it away once localStorage is read would be a flash of a warning
  // that had already been dismissed.
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(localStorage.getItem(key) === null);
    } catch {
      setShow(true);
    }
  }, [key]);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(key, "1");
    } catch {
      // Private mode. It reappears next navigation, which is the right failure
      // for a warning — annoying beats silent.
    }
  }

  if (!show) return null;

  return (
    <div
      role="status"
      className="rise-in mx-auto mb-0 mt-4 flex w-full max-w-6xl flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border px-5 py-3.5"
      style={{
        borderColor: empty ? "var(--color-accent-300)" : "var(--color-accent-400)",
        background: "var(--color-accent-100)",
      }}
    >
      {/* Basis, not `flex-1`. With a zero basis the sentence shrinks instead of
          wrapping the row, and on a phone it ends up a 70px column twelve lines
          tall beside a button that refuses to shrink. 250px is the design's own
          basis for this banner. */}
      <p className="min-w-0 flex-[1_1_250px] text-sm leading-relaxed text-[var(--color-accent-800)]">
        <strong className="font-semibold">{text}</strong>{" "}
        {empty ? `It refills on ${resetDate}, or add extra analyses on a paid plan.` : `It refills on ${resetDate}.`}
      </p>

      <Link href="/profile" className="btn btn-secondary btn-sm no-underline">
        See your usage
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="grid h-8 w-8 flex-none place-items-center rounded-[var(--radius-pill)] text-[var(--color-accent-800)] transition-colors hover:bg-[var(--color-accent-200)]"
      >
        <X className="lucide h-4 w-4" />
      </button>
    </div>
  );
}

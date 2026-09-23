"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { setRoadmapItemDone } from "@/app/actions/roadmap";

/**
 * One checklist row (F21). Ticking is optimistic and local — `done_at` is the
 * one column on this table the user, not a revalidation, ever moves (N15).
 * A failed write reverts the tick rather than lying about it.
 */
export function RoadmapItem({
  id,
  label,
  href,
  hint,
  doneAt,
  onToggled,
}: {
  id: string;
  label: string;
  href: string | null;
  /** A fact the app can see — "Exported 12 Sep", "Answer drafted" — never a substitute for the tick. */
  hint: string | null;
  doneAt: Date | null;
  onToggled: (done: boolean) => void;
}) {
  const [done, setDone] = useState(doneAt !== null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !done;
    setDone(next);
    onToggled(next);
    startTransition(async () => {
      const result = await setRoadmapItemDone(id, next);
      if (!result.ok) setDone(!next); // revert on failure
    });
  }

  return (
    <div className="flex items-center gap-3.5 border-t border-[rgb(74_13_13/0.08)] py-3">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={done}
        aria-label={done ? `Mark "${label}" not done` : `Mark "${label}" done`}
        className="grid h-7 w-7 flex-none place-items-center rounded-[var(--radius-pill)] border-[1.5px] transition-colors"
        style={{
          borderColor: done ? "var(--color-accent-500)" : "var(--color-line-strong)",
          background: done ? "var(--color-accent-500)" : "transparent",
        }}
      >
        {done ? <Check className="lucide h-3.5 w-3.5" strokeWidth={3.2} /> : null}
      </button>

      <div className="min-w-0 flex-1">
        {href ? (
          <Link
            href={href}
            className={`block text-[15px] font-semibold leading-snug no-underline ${done ? "text-[var(--color-text-muted)] line-through" : ""}`}
          >
            {label}
          </Link>
        ) : (
          <span
            className={`block text-[15px] font-semibold leading-snug ${done ? "text-[var(--color-text-muted)] line-through" : ""}`}
          >
            {label}
          </span>
        )}
        {hint ? <span className="block text-xs text-[var(--color-text-muted)]">{hint}</span> : null}
      </div>
    </div>
  );
}

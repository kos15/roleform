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
    <div className="flex items-center gap-3 border-t border-[var(--color-line)] py-2.5 first:border-t-0">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={done}
        aria-label={done ? `Mark "${label}" not done` : `Mark "${label}" done`}
        className="grid h-6 w-6 flex-none place-items-center rounded-[var(--radius-pill)] border transition-colors"
        style={{
          borderColor: done ? "var(--color-sage-500)" : "var(--color-line)",
          background: done ? "var(--color-sage-500)" : "transparent",
        }}
      >
        {done ? <Check className="lucide h-3.5 w-3.5 text-white" strokeWidth={3} /> : null}
      </button>

      <div className="min-w-0 flex-1">
        {href ? (
          <Link
            href={href}
            className={`block truncate text-sm ${done ? "text-[var(--color-text-muted)] line-through" : ""}`}
          >
            {label}
          </Link>
        ) : (
          <span className={`block truncate text-sm ${done ? "text-[var(--color-text-muted)] line-through" : ""}`}>
            {label}
          </span>
        )}
        {hint ? <span className="block text-xs text-[var(--color-text-muted)]">{hint}</span> : null}
      </div>
    </div>
  );
}

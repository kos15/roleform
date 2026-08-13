"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * "How much time do you have?" — the input to the knapsack (RLE spec §10).
 *
 * Changing it costs nothing. The plan is re-solved by a pure function on the
 * server (lib/domain/plan.ts, single-digit milliseconds) — no model call, no
 * retrieval, no second charge. That is why this is a control rather than a
 * setting you have to choose before paying for a run.
 */
const OPTIONS: Array<{ label: string; minutes: number | null }> = [
  { label: "2 hrs", minutes: 120 },
  { label: "6 hrs", minutes: 360 },
  { label: "A weekend", minutes: 960 },
  { label: "No limit", minutes: null },
];

export function BudgetPicker({ selected }: { selected: number | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function choose(minutes: number | null) {
    const next = new URLSearchParams(params.toString());
    if (minutes === null) next.delete("budget");
    else next.set("budget", String(minutes));
    startTransition(() => router.replace(`?${next.toString()}`, { scroll: false }));
  }

  return (
    <div className="seg" role="tablist" aria-label="How much time you have">
      {OPTIONS.map((option) => (
        <button
          key={option.label}
          type="button"
          role="tab"
          aria-selected={selected === option.minutes}
          disabled={pending}
          onClick={() => choose(option.minutes)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSavedJobStatus, unsaveJob } from "@/app/actions/jobs";
import type { SavedJobStatus } from "@/lib/generated/prisma/enums";

const STATUSES: SavedJobStatus[] = ["saved", "applied", "interviewing", "offer", "rejected", "closed"];

export function SavedStatus({ savedJobId, status }: { savedJobId: string; status: SavedJobStatus }) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [pending, startTransition] = useTransition();

  function change(next: SavedJobStatus) {
    setCurrent(next);
    startTransition(async () => {
      await setSavedJobStatus(savedJobId, next);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      await unsaveJob(savedJobId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Application status">
      {STATUSES.map((s) => {
        const on = s === current;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            disabled={pending}
            onClick={() => change(s)}
            className={`min-h-8 rounded-[var(--radius-pill)] border-[1.5px] px-3 text-[12.5px] font-bold capitalize transition-colors ${
              on
                ? "border-[var(--color-text)] bg-[var(--color-text)] text-[var(--color-accent-500)]"
                : "border-[rgb(74_13_13/0.2)] hover:bg-[var(--color-hover)]"
            }`}
          >
            {s}
          </button>
        );
      })}
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="px-2 text-[12.5px] text-[var(--color-text-muted)] underline underline-offset-[3px]"
      >
        Remove
      </button>
    </div>
  );
}

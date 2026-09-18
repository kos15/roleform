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
    <div className="flex items-center gap-2">
      <select
        value={current}
        onChange={(e) => change(e.target.value as SavedJobStatus)}
        disabled={pending}
        className="input h-auto py-1.5 text-sm"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="text-xs text-[var(--color-text-muted)] underline"
      >
        Remove
      </button>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { setSavedJobNote } from "@/app/actions/jobs";
import { Button, Textarea } from "@/components/ui";

/**
 * The member's own note on a saved job — who they spoke to, what was said,
 * when to chase. User-authored, saved only when they press Save (N3 applied).
 */
export function SavedNote({ savedJobId, note }: { savedJobId: string; note: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(note);
  const [stored, setStored] = useState(note);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setSavedJobNote(savedJobId, value);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setStored(value);
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <div className="mt-2.5 text-[13.5px]">
        {stored ? <p className="mb-1 whitespace-pre-line text-[var(--color-text-muted)]">{stored}</p> : null}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-bold underline underline-offset-[3px]"
        >
          {stored ? "Edit note" : "Add a note"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <Textarea
        aria-label="Note on this job"
        rows={3}
        maxLength={2000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Who you spoke to, what they said, when to follow up."
      />
      {error ? <p className="mt-1 text-[13px] text-[var(--color-accent-700)]">{error}</p> : null}
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={save} disabled={pending} busy={pending}>
          Save note
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setValue(stored);
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

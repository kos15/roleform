"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button, Card, Input, Textarea } from "@/components/ui";
import { updateProfile } from "@/app/actions/onboarding";
import type { ResumeJson } from "@/lib/ai/schemas/resume-json";

/**
 * M2.6 — profile editor: add / edit / reorder / delete bullets, with autosave.
 *
 * The AI layer never writes here (N3). Every change on this screen is
 * user-authored, which is what makes the fabrication guard meaningful: the
 * source of truth is a document the user typed.
 */
export function ProfileEditor({ initial }: { initial: ResumeJson }) {
  const [resume, setResume] = useState<ResumeJson>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setStatus("saving");
    const timer = setTimeout(async () => {
      const result = await updateProfile(resume);
      setStatus(result.ok ? "saved" : "error");
    }, 900);
    return () => clearTimeout(timer);
  }, [resume]);

  function mutateHighlights(
    workIndex: number,
    fn: (highlights: string[]) => string[],
  ) {
    setResume((r) => ({
      ...r,
      work: r.work.map((w, i) => (i === workIndex ? { ...w, highlights: fn(w.highlights) } : w)),
    }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]" aria-live="polite">
        {status === "saving" && "Saving…"}
        {status === "saved" && "All changes saved"}
        {status === "error" && (
          <span className="text-[var(--color-danger-700)]">That change didn&rsquo;t save.</span>
        )}
      </div>

      {resume.work.map((work, wi) => (
        <Card key={wi}>
          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <Input
              aria-label="Position"
              value={work.position}
              onChange={(e) =>
                setResume((r) => ({
                  ...r,
                  work: r.work.map((w, i) => (i === wi ? { ...w, position: e.target.value } : w)),
                }))
              }
            />
            <Input
              aria-label="Employer"
              value={work.name}
              onChange={(e) =>
                setResume((r) => ({
                  ...r,
                  work: r.work.map((w, i) => (i === wi ? { ...w, name: e.target.value } : w)),
                }))
              }
            />
          </div>

          <div className="space-y-2">
            {work.highlights.map((highlight, hi) => (
              <div key={hi} className="flex items-start gap-2">
                <Textarea
                  aria-label={`Bullet ${hi + 1}`}
                  rows={2}
                  value={highlight}
                  onChange={(e) =>
                    mutateHighlights(wi, (hs) => hs.map((h, j) => (j === hi ? e.target.value : h)))
                  }
                />
                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Move bullet up"
                    disabled={hi === 0}
                    onClick={() => mutateHighlights(wi, (hs) => swap(hs, hi, hi - 1))}
                  >
                    <ArrowUp className="lucide h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Move bullet down"
                    disabled={hi === work.highlights.length - 1}
                    onClick={() => mutateHighlights(wi, (hs) => swap(hs, hi, hi + 1))}
                  >
                    <ArrowDown className="lucide h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Delete bullet"
                    onClick={() => mutateHighlights(wi, (hs) => hs.filter((_, j) => j !== hi))}
                  >
                    <Trash2 className="lucide h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => mutateHighlights(wi, (hs) => [...hs, ""])}>
              <Plus className="lucide h-4 w-4" /> Add bullet
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function swap<T>(items: T[], a: number, b: number): T[] {
  const next = [...items];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

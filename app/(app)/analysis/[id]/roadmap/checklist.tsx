"use client";

import { useState } from "react";
import { RoadmapItem } from "./roadmap-item";
import type { RoadmapItemView } from "@/lib/db/queries/roadmap";

const SECTION_LABEL: Record<string, string> = {
  prepare: "Prepare",
  rehearse: "Rehearse",
  deepen: "Deepen",
  learn: "Learn",
  apply: "Apply",
};

const SECTION_ORDER = ["prepare", "rehearse", "deepen", "learn", "apply"];

/**
 * Owns the live `n of m` count client-side, so a tick updates the header
 * without a full page round trip — the write already happened in
 * `RoadmapItem`; this only keeps the number honest while the page is open.
 */
export function Checklist({ items }: { items: RoadmapItemView[] }) {
  const [doneIds, setDoneIds] = useState(
    () => new Set(items.filter((i) => i.doneAt !== null).map((i) => i.id)),
  );

  const bySection = new Map<string, RoadmapItemView[]>();
  for (const item of items) {
    bySection.set(item.section, [...(bySection.get(item.section) ?? []), item]);
  }

  function onToggled(id: string, done: boolean) {
    setDoneIds((prev) => {
      const next = new Set(prev);
      if (done) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div>
      <p className="mb-5 text-sm text-[var(--color-text-muted)]">
        {doneIds.size} of {items.length} done
      </p>

      <div className="flex flex-col gap-6">
        {SECTION_ORDER.filter((s) => bySection.has(s)).map((section) => (
          <section key={section}>
            <h3 className="mb-1 text-[0.95rem]">{SECTION_LABEL[section] ?? section}</h3>
            <div>
              {bySection.get(section)!.map((item) => (
                <RoadmapItem
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  href={item.href}
                  hint={null}
                  doneAt={item.doneAt}
                  onToggled={(done) => onToggled(item.id, done)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

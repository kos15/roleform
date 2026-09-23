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
      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-[18px]">
        {/* N16: a count, never a percentage and never "ready". The bar below
            draws the same count; it carries no number of its own. */}
        <h2>
          {doneIds.size} of {items.length} done
        </h2>
        <p className="max-w-[44ch] text-[15px] text-[var(--color-text-muted)]">
          Assembled from what this analysis already made. Building it cost zero tokens; ticking is
          your own record.
        </p>
      </div>
      <div className="progress mb-8" aria-hidden>
        <span style={{ width: `${items.length ? (doneIds.size / items.length) * 100 : 0}%` }} />
      </div>

      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))]">
        {SECTION_ORDER.filter((s) => bySection.has(s)).map((section) => (
          <section
            key={section}
            className="rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)] px-6 pb-3 pt-[22px]"
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-2.5">
              <h3 className="display text-[28px] font-normal">{SECTION_LABEL[section] ?? section}</h3>
              <span className="text-[13px] font-bold text-[var(--color-text-muted)]">
                {bySection.get(section)!.filter((i) => doneIds.has(i.id)).length} /{" "}
                {bySection.get(section)!.length}
              </span>
            </div>
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

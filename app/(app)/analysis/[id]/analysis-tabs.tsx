"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

/**
 * The three surfaces. Real links rather than client state, so a tab is
 * shareable and the browser's back button behaves.
 *
 * role="tablist" with aria-selected keeps the a11y contract of a tab set
 * (specs §11) while the underlying navigation stays ordinary links.
 *
 * Each tab is a dynamic server render, so a click has a real round trip behind
 * it. `useLinkStatus` reports Next's own pending state for THIS link, so the
 * button can say so immediately — paired with the route's loading.tsx, which
 * both fills the wait and gives prefetch a boundary to fetch.
 *
 * The count is rendered before the tab is opened on purpose: a surface that
 * generated nothing should be visible as empty from here, not after a click.
 */
export interface TabCounts {
  resumes: number;
  questions: number;
  gaps: number;
  /** null before a roadmap is built (F21) — the tab reads "—", not "0 of 0". */
  roadmapProgress: { done: number; total: number } | null;
}

export function AnalysisTabs({
  analysisId,
  counts,
}: {
  analysisId: string;
  counts: TabCounts;
}) {
  const pathname = usePathname();

  const tabs = [
    { slug: "resumes", label: "Résumés", count: String(counts.resumes) },
    { slug: "prep", label: "Interview prep", count: String(counts.questions) },
    {
      slug: "learning",
      label: "Learning",
      count: `${counts.gaps} gap${counts.gaps === 1 ? "" : "s"}`,
    },
    {
      slug: "roadmap",
      label: "Roadmap",
      // N16: a count, never a percentage — "—" before it exists, "n/m" after.
      count: counts.roadmapProgress
        ? `${counts.roadmapProgress.done}/${counts.roadmapProgress.total}`
        : "—",
    },
  ];

  return (
    <div className="tab-bar" data-tour="tabs" role="tablist" aria-label="Analysis sections">
      {tabs.map((tab) => {
        const href = `/analysis/${analysisId}/${tab.slug}`;
        // A preview is a résumé opened, not a fourth place to be. Matching only
        // the exact path left every tab unselected there, so the bar said you
        // were nowhere.
        const selected =
          pathname === href ||
          (tab.slug === "resumes" && pathname.startsWith(`/analysis/${analysisId}/preview/`));
        return (
          <Link key={tab.slug} href={href} role="tab" aria-selected={selected} tabIndex={0}>
            <TabButton label={tab.label} count={tab.count} selected={selected} />
          </Link>
        );
      })}
    </div>
  );
}

/** Must be a child of Link — that is where useLinkStatus reads its state from. */
function TabButton({
  label,
  count,
  selected,
}: {
  label: string;
  count: string;
  selected: boolean;
}) {
  const { pending } = useLinkStatus();
  return (
    <button
      type="button"
      aria-selected={selected}
      data-pending={pending ? "true" : undefined}
      className={pending ? "opacity-70" : undefined}
      tabIndex={-1}
    >
      {label}
      <span className="tab-count">{count}</span>
    </button>
  );
}

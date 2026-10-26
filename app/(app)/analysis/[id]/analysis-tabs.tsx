"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, CalendarDays, FileText, GraduationCap, ListChecks, MessageSquareText, Zap, type LucideIcon } from "lucide-react";

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
  /** F26: decks, rounds and challenges started — "3 drills" before any. */
  drills: number;
  /** F29: the next round still ahead, already phrased ("Thu 16 Oct"), or null. */
  nextRound: string | null;
  /** F30: "6 sessions", "2h short" or "Set a date" — already phrased. */
  study: string;
}

export function AnalysisTabs({
  analysisId,
  counts,
  hidden = [],
  generating = false,
}: {
  analysisId: string;
  counts: TabCounts;
  /** F31: tab slugs whose feature is switched off site-wide. */
  hidden?: string[];
  /** Prep and Learning still generating behind the résumés. */
  generating?: boolean;
}) {
  const pathname = usePathname();
  // A zero while the stage is still writing would read as "generated nothing".
  const PENDING = "Preparing…";

  const tabs = [
    { slug: "resumes", label: "Résumés", count: String(counts.resumes), icon: FileText },
    {
      slug: "prep",
      label: "Interview prep",
      count: generating && counts.questions === 0 ? PENDING : String(counts.questions),
      icon: MessageSquareText,
    },
    {
      slug: "learning",
      label: "Learning",
      count:
        generating && counts.gaps === 0 ? PENDING : `${counts.gaps} gap${counts.gaps === 1 ? "" : "s"}`,
      icon: GraduationCap,
    },
    { slug: "schedule", label: "Study plan", count: counts.study, icon: CalendarDays },
    {
      slug: "roadmap",
      label: "Roadmap",
      // N16: a count, never a percentage — "—" before it exists, "n/m" after.
      count: counts.roadmapProgress
        ? `${counts.roadmapProgress.done}/${counts.roadmapProgress.total}`
        : "—",
      icon: ListChecks,
    },
    {
      slug: "rapid",
      label: "Rapid prep",
      count: counts.drills > 0 ? `${counts.drills} session${counts.drills === 1 ? "" : "s"}` : "3 drills",
      icon: Zap,
    },
    {
      slug: "rounds",
      label: "Rounds",
      count: counts.nextRound ?? "Add one",
      icon: CalendarClock,
    },
  ];

  return (
    <div className="tab-bar" data-tour="tabs" role="tablist" aria-label="Analysis sections">
      {tabs.filter((tab) => !hidden.includes(tab.slug)).map((tab) => {
        const href = `/analysis/${analysisId}/${tab.slug}`;
        // A preview is a résumé opened, not a fourth place to be. Matching only
        // the exact path left every tab unselected there, so the bar said you
        // were nowhere.
        const selected =
          pathname === href ||
          (tab.slug === "rapid" && pathname.startsWith(`${href}/`)) ||
          (tab.slug === "resumes" && pathname.startsWith(`/analysis/${analysisId}/preview/`));
        return (
          <Link key={tab.slug} href={href} role="tab" aria-selected={selected} tabIndex={0}>
            <TabButton label={tab.label} count={tab.count} icon={tab.icon} selected={selected} />
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
  icon: Icon,
  selected,
}: {
  label: string;
  count: string;
  icon: LucideIcon;
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
      <span className="tab-dot" aria-hidden>
        <Icon className="lucide h-4 w-4" />
      </span>
      <span>
        <span className="tab-label">{label}</span>
        <span className="tab-count">{count}</span>
      </span>
    </button>
  );
}

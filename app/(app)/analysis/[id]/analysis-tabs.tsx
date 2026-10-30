"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  sectionCountLabels,
  sectionFromPath,
  visibleSections,
  type SectionCounts,
} from "@/lib/domain/analysis-nav";
import { SECTION_ICONS } from "./section-icons";

/**
 * The analysis sections, in journey order (lib/domain/analysis-nav.ts). Real
 * links rather than client state, so a tab is shareable and the browser's back
 * button behaves.
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
 *
 * The section counts are kept under the name the layout already uses.
 */
export type TabCounts = SectionCounts;

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
  const labels = sectionCountLabels(counts, generating);
  const current = sectionFromPath(pathname, analysisId);

  return (
    <div className="tab-bar" data-tour="tabs" role="tablist" aria-label="Analysis sections">
      {visibleSections(hidden).map((tab) => {
        // A preview is a résumé opened, not another place to be — so the
        // Résumés card reads selected there (sectionFromPath).
        const selected = current === tab.slug;
        return (
          <Link
            key={tab.slug}
            href={`/analysis/${analysisId}/${tab.slug}`}
            role="tab"
            aria-selected={selected}
            tabIndex={0}
          >
            <TabButton
              label={tab.label}
              count={labels[tab.slug]}
              icon={SECTION_ICONS[tab.slug]}
              selected={selected}
            />
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

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
 */
const TABS = [
  { slug: "resumes", label: "Resumes" },
  { slug: "prep", label: "Prep" },
  { slug: "learning", label: "Learning" },
] as const;

export function AnalysisTabs({ analysisId }: { analysisId: string }) {
  const pathname = usePathname();

  return (
    <div className="seg" role="tablist" aria-label="Analysis sections">
      {TABS.map((tab) => {
        const href = `/analysis/${analysisId}/${tab.slug}`;
        const selected = pathname === href;
        return (
          <Link key={tab.slug} href={href} role="tab" aria-selected={selected} tabIndex={0}>
            <TabButton label={tab.label} selected={selected} />
          </Link>
        );
      })}
    </div>
  );
}

/** Must be a child of Link — that is where useLinkStatus reads its state from. */
function TabButton({ label, selected }: { label: string; selected: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <button
      type="button"
      aria-selected={selected}
      data-pending={pending ? "true" : undefined}
      tabIndex={-1}
    >
      {label}
    </button>
  );
}

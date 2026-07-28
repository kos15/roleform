"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The three surfaces. Real links rather than client state, so a tab is
 * shareable and the browser's back button behaves.
 *
 * role="tablist" with aria-selected keeps the a11y contract of a tab set
 * (specs §11) while the underlying navigation stays ordinary links.
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
            <button type="button" aria-selected={selected} tabIndex={-1}>
              {tab.label}
            </button>
          </Link>
        );
      })}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUp, ChevronRight, Menu } from "lucide-react";
import {
  dockSplit,
  sectionFromPath,
  visibleSections,
  type SectionSlug,
} from "@/lib/domain/analysis-nav";
import { SECTION_ICONS } from "./section-icons";

/**
 * The analysis's own navigation, reachable from every scroll position.
 *
 * The tab cards sit under the score and its buckets — on a phone that put them
 * a long scroll above any section, so once you were reading the drafts there
 * was no way to Prep or Learning short of scrolling all the way back. Two
 * pieces fix that, and both read the one journey (lib/domain/analysis-nav.ts):
 *
 * - **Phone (≤860px): the bottom bar becomes this analysis.** Inside a
 *   finished analysis, the global bar's slots (New · Jobs · Profile · Plans)
 *   are the wrong four — you are working on one posting. So the dock carries
 *   its sections, the one you are on always in a slot, and More holds the rest
 *   of the sections plus the way back out to the product. The global bar is
 *   hidden by CSS while this one is on the page (`.analysis-dock` in
 *   globals.css), and comes back the moment you leave.
 * - **Desktop: a rail under the header** that slides in once the tab cards
 *   have scrolled off, so the next section is never further than the top of
 *   the screen.
 */
export interface ElsewhereLink {
  href: string;
  label: string;
}

export function AnalysisDock({
  analysisId,
  title,
  labels,
  hidden = [],
  elsewhere,
}: {
  analysisId: string;
  title: string;
  /** Each section's count, already phrased (sectionCountLabels). */
  labels: Record<SectionSlug, string>;
  /** F31: section slugs switched off site-wide. */
  hidden?: string[];
  /** The product outside this analysis, for the phone sheet. */
  elsewhere: ElsewhereLink[];
}) {
  const pathname = usePathname();
  const current = sectionFromPath(pathname, analysisId);
  return (
    <>
      <SectionRail analysisId={analysisId} title={title} labels={labels} hidden={hidden} current={current} />
      <PhoneDock
        analysisId={analysisId}
        title={title}
        labels={labels}
        hidden={hidden}
        current={current}
        elsewhere={elsewhere}
        resetKey={pathname}
      />
    </>
  );
}

/** Desktop: appears when the tab cards (`[data-tour="tabs"]`) are off screen. */
export function SectionRail({
  analysisId,
  title,
  labels,
  hidden,
  current,
}: {
  analysisId: string;
  title: string;
  labels: Record<SectionSlug, string>;
  hidden: string[];
  current: SectionSlug | null;
}) {
  const [shown, setShown] = useState(false);
  const [top, setTop] = useState(0);

  useEffect(() => {
    const cards = document.querySelector('[data-tour="tabs"]');
    const header = document.querySelector<HTMLElement>("header.nav");
    if (!cards) return;
    // The header is sticky and its height moves with the viewport, so the rail
    // tucks under wherever it actually ends rather than a guessed constant.
    const measure = () => setTop(header ? header.getBoundingClientRect().height : 0);
    measure();
    const resize = new ResizeObserver(measure);
    if (header) resize.observe(header);
    const seen = new IntersectionObserver(([entry]) => {
      // Only once the cards have gone off the TOP — not while they are still
      // below the fold on the way down.
      setShown(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    seen.observe(cards);
    return () => {
      resize.disconnect();
      seen.disconnect();
    };
  }, []);

  return (
    <nav
      className="section-rail wide-only"
      aria-label="This analysis"
      data-shown={shown}
      aria-hidden={!shown}
      style={{ top }}
    >
      <div className="section-rail-inner">
        <button
          type="button"
          className="section-rail-title"
          tabIndex={shown ? 0 : -1}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          title="Back to the match"
        >
          <ArrowUp className="lucide h-4 w-4 flex-none" />
          <span className="truncate">{title}</span>
        </button>
        <div className="section-rail-chips">
          {visibleSections(hidden).map((s) => {
            const Icon = SECTION_ICONS[s.slug];
            return (
              <Link
                key={s.slug}
                href={`/analysis/${analysisId}/${s.slug}`}
                className="section-chip"
                aria-current={current === s.slug ? "page" : undefined}
                tabIndex={shown ? 0 : -1}
              >
                <Icon className="lucide h-4 w-4 flex-none" />
                <span>{s.label}</span>
                <span className="section-chip-count">{labels[s.slug]}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export function PhoneDock({
  analysisId,
  title,
  labels,
  hidden,
  current,
  elsewhere,
  resetKey,
}: {
  analysisId: string;
  title: string;
  labels: Record<SectionSlug, string>;
  hidden: string[];
  current: SectionSlug | null;
  elsewhere: ElsewhereLink[];
  /** Changes on navigation — the sheet closes when it does. */
  resetKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const { dock } = dockSplit(visibleSections(hidden), current);
  // More reads "on" when it holds where you are — off the path, like the portfolio.
  const moreHoldsYou = current === null;

  useEffect(() => {
    setOpen(false);
  }, [resetKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <nav className="tabbar analysis-dock" aria-label="This analysis">
        {dock.map((s) => {
          const Icon = SECTION_ICONS[s.slug];
          return (
            <Link
              key={s.slug}
              href={`/analysis/${analysisId}/${s.slug}`}
              className="tabbar-btn"
              aria-current={current === s.slug ? "page" : undefined}
            >
              <Icon className="lucide h-5 w-5" />
              <span>{s.short}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className="tabbar-btn"
          data-on={open || moreHoldsYou}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((v) => !v)}
        >
          <Menu className="lucide h-5 w-5" />
          <span>More</span>
        </button>
      </nav>

      {open ? (
        <div className="sheet-scrim" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="This analysis"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-grip" aria-hidden />
            <p className="eyebrow mb-1">This analysis</p>
            <p className="mb-3 truncate text-[17px] font-extrabold">{title}</p>

            <div className="flex flex-col divide-y divide-[var(--color-line)]">
              {visibleSections(hidden).map((s) => {
                const Icon = SECTION_ICONS[s.slug];
                return (
                  <Link
                    key={s.slug}
                    href={`/analysis/${analysisId}/${s.slug}`}
                    className="sheet-row"
                    aria-current={current === s.slug ? "page" : undefined}
                  >
                    <Icon className="lucide h-5 w-5 flex-none" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold">{s.label}</span>
                      <span className="block truncate text-xs text-[var(--color-text-muted)]">
                        {labels[s.slug]}
                      </span>
                    </span>
                    <ChevronRight className="lucide h-4 w-4 flex-none text-[var(--color-text-muted)]" />
                  </Link>
                );
              })}
            </div>

            <p className="eyebrow mb-2 mt-6">Elsewhere</p>
            <div className="flex flex-wrap gap-2">
              {elsewhere.map((link) => (
                <Link key={link.href} href={link.href} className="btn btn-secondary btn-sm no-underline">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

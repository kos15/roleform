"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  journeyStep,
  sectionFromPath,
  visibleSections,
  type SectionSlug,
} from "@/lib/domain/analysis-nav";
import { SECTION_ICONS } from "./section-icons";

/**
 * "Up next" — the foot of every section.
 *
 * Reaching the end of a section used to mean the end of the page: the footer,
 * and nothing to say that the drafts were step one of seven. This card names
 * where you are on the path, what the next step gets you, and opens it in one
 * tap. It reads the same journey as the tabs and the dock, so the step it
 * offers is always the next card along.
 */
export function AnalysisJourney({
  analysisId,
  labels,
  hidden = [],
}: {
  analysisId: string;
  labels: Record<SectionSlug, string>;
  hidden?: string[];
}) {
  const pathname = usePathname();
  return (
    <JourneyCard
      analysisId={analysisId}
      labels={labels}
      hidden={hidden}
      current={sectionFromPath(pathname, analysisId)}
    />
  );
}

export function JourneyCard({
  analysisId,
  labels,
  hidden,
  current,
}: {
  analysisId: string;
  labels: Record<SectionSlug, string>;
  hidden: string[];
  current: SectionSlug | null;
}) {
  const step = journeyStep(current, hidden);
  if (!step) return null;
  const sections = visibleSections(hidden);
  const href = (slug: SectionSlug) => `/analysis/${analysisId}/${slug}`;
  const NextIcon = step.next ? SECTION_ICONS[step.next.slug] : null;

  return (
    <nav aria-label="Your path through this analysis" className="journey mt-[clamp(3rem,6vw,5rem)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow">
          Step {step.index} of {step.total}
        </p>
        {/* One dot per section, the current one stretched — the shape of the
            path at a glance, and each dot a link to that step. */}
        <ol className="journey-dots" aria-label="Steps">
          {sections.map((s, i) => (
            <li key={s.slug}>
              <Link
                href={href(s.slug)}
                className="journey-dot"
                data-state={s.slug === current ? "here" : i < step.index - 1 ? "past" : "ahead"}
                aria-current={s.slug === current ? "step" : undefined}
                aria-label={s.label}
                title={s.label}
              />
            </li>
          ))}
        </ol>
      </div>

      {step.next && NextIcon ? (
        <Link href={href(step.next.slug)} className="journey-next no-underline">
          <span className="journey-next-icon" aria-hidden>
            <NextIcon className="lucide h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Up next · {labels[step.next.slug]}</span>
            <span className="display block text-[clamp(1.75rem,4.5vw,3rem)] leading-none">
              {step.next.label}
            </span>
            <span className="mt-2 block max-w-[60ch] text-[15px] leading-relaxed">
              {step.next.pitch}
            </span>
          </span>
          <ArrowRight className="lucide h-7 w-7 flex-none" aria-hidden />
        </Link>
      ) : (
        <div className="journey-next" data-last="true">
          <span className="min-w-0 flex-[1_1_18rem]">
            <span className="block text-sm font-bold">That&rsquo;s the whole path</span>
            <span className="display block text-[clamp(1.75rem,4.5vw,3rem)] leading-none">
              Next posting
            </span>
            <span className="mt-2 block max-w-[60ch] text-[15px] leading-relaxed">
              Everything here stays in History. Run the next posting against the same profile.
            </span>
          </span>
          <span className="flex flex-wrap gap-2">
            <Link href="/analyze" className="btn btn-primary no-underline">
              New analysis
            </Link>
            <Link href="/history" className="btn btn-secondary no-underline">
              History
            </Link>
          </span>
        </div>
      )}

      {step.prev ? (
        <Link href={href(step.prev.slug)} className="mt-4 inline-flex items-center gap-2 text-sm font-bold no-underline">
          <ArrowLeft className="lucide h-4 w-4" aria-hidden />
          Back to {step.prev.label}
        </Link>
      ) : null}
    </nav>
  );
}

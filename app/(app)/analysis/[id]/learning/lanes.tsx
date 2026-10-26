import Link from "next/link";
import { BookOpen, ExternalLink, Play } from "lucide-react";
import { Tag } from "@/components/ui";
import { formatMinutes } from "@/lib/domain/plan";
import type { Lane } from "@/lib/domain/lanes";
import type { LearningStepView } from "@/lib/db/queries/learning";

/**
 * One gap's resources as two alternative lanes: Watch (videos, courses) and Read
 * (docs, roadmaps). The gap's single primary step spends budget; every other row
 * is offered "instead" and costs none. Rows arrive already in display order
 * (compareGapSteps), so each lane just filters.
 *
 * Watch is pink (sage ramp), Read is marigold (accent ramp). The auto-fit grid
 * stacks the lanes on a phone with Watch first, since Watch precedes Read in
 * the DOM.
 */

const LANES: {
  lane: Lane;
  label: string;
  Icon: typeof Play;
  badge: string;
  empty: string;
  capped: string;
  instead: string;
}[] = [
  {
    lane: "watch",
    label: "Watch",
    Icon: Play,
    badge: "bg-[var(--color-sage-500)]",
    empty: "No vetted videos for this yet.",
    capped: "More videos on a higher plan",
    instead: "or watch this instead",
  },
  {
    lane: "read",
    label: "Read",
    Icon: BookOpen,
    badge: "bg-[var(--color-accent-500)]",
    empty: "No vetted reading for this yet.",
    capped: "More reading on a higher plan",
    instead: "or read this instead",
  },
];

export function Lanes({ steps, cappedLanes }: { steps: LearningStepView[]; cappedLanes: Lane[] }) {
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
      {LANES.map(({ lane, label, Icon, badge, empty, capped, instead }) => {
        const rows = steps.filter((s) => s.lane === lane);
        const isCapped = cappedLanes.includes(lane);
        return (
          <div key={lane}>
            <div className="mb-3 flex items-center gap-2.5">
              <span
                className={`flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-pill)] ${badge}`}
              >
                <Icon className="lucide h-4 w-4" />
              </span>
              <span className="eyebrow">{label}</span>
            </div>

            {rows.length > 0 ? (
              <ol className="space-y-3">
                {rows.map((step) => (
                  <li key={step.id}>
                    <a
                      href={step.entryUrl ?? step.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`block rounded-[var(--radius-md)] bg-[var(--color-bg-tint)] px-3.5 py-3.5 no-underline sm:px-[18px] sm:py-4 transition-transform hover:-translate-y-0.5 ${
                        step.deferred ? "opacity-50" : ""
                      }`}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-pill)] ${badge}`}
                        >
                          <Icon className="lucide h-4 w-4" />
                        </span>
                        <span className="text-sm font-extrabold">{step.author ?? step.provider}</span>
                        {lane === "read" && step.docKind ? (
                          <Tag tone="outline">{step.docKind === "official" ? "Official" : "Tutorial"}</Tag>
                        ) : null}
                        {!step.isPrimary ? (
                          <span className="text-xs font-bold text-[var(--color-text-muted)]">{instead}</span>
                        ) : step.deferred ? (
                          <Tag tone="muted">Outside your budget</Tag>
                        ) : (
                          <Tag tone="muted">from {formatMinutes(step.startsAtMin)} in</Tag>
                        )}
                      </div>

                      <p className="mb-1.5 text-base font-extrabold">{step.title}</p>

                      {/* Spec §8 — the differentiator is WHERE you land. */}
                      {step.entryLabel ? (
                        <p className="mb-1.5 flex items-center gap-1.5 text-sm font-extrabold">
                          <Play className="lucide h-3.5 w-3.5 fill-current" />
                          Start at {step.entryLabel}
                        </p>
                      ) : null}

                      {step.note ? (
                        <p className="more-copy mb-2.5 text-sm leading-normal text-[var(--color-text-muted)]">
                          {step.note}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Tag className={`font-extrabold ${step.isFree ? "bg-[var(--color-bg-raised)]" : ""}`}>
                          {step.priceLabel}
                        </Tag>
                        <Tag tone="muted">{formatMinutes(step.durationMin)}</Tag>
                        <span className="ml-1 inline-flex items-center gap-1 text-[13px] font-extrabold">
                          Open <ExternalLink className="lucide h-3.5 w-3.5" />
                        </span>
                      </div>
                    </a>
                  </li>
                ))}
              </ol>
            ) : isCapped ? null : (
              <p className="text-sm text-[var(--color-text-muted)]">{empty}</p>
            )}

            {isCapped ? (
              <Link
                href="/pricing"
                className={`${rows.length > 0 ? "mt-3 " : ""}inline-block text-sm font-bold`}
              >
                {capped}
              </Link>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

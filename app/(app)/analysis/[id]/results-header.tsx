"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Tag } from "@/components/ui";
import { InfoNote } from "@/components/info-note";
import { scoreDash } from "@/lib/domain/coverage";
import type { DomainCoverageItem, DomainRequirement } from "@/lib/domain/types";

/**
 * F4 — one compact band: the score ring in one card with the three bucket
 * counts beside it, and every requirement tag behind one disclosure.
 *
 * N4: this number is requirement coverage. It is never labelled "ATS score",
 * and it is never rendered without the three bucket counts in the same card —
 * the word "ATS" appears in this product only on a template badge.
 *
 * Every Strong-match tag expands to its source bullet in one click once the
 * disclosure is open (M3.8).
 */
const CIRCUMFERENCE = 2 * Math.PI * 52;

/** Both the ring card and the disclosure read this, so the titles cannot drift apart. */
const BUCKETS = [
  { tone: "evidenced", title: "Strong match" },
  { tone: "partial", title: "Partial evidence" },
  { tone: "absent", title: "Not evidenced" },
] as const;

export function ResultsHeader({
  analysis,
  requirements,
  coverage,
  bulletTexts,
}: {
  analysis: {
    jdSource: "paste" | "upload";
    jdFilename: string | null;
    company: string | null;
    title: string | null;
    location: string | null;
    seniority: string | null;
    employmentType: string | null;
    score: number;
    scoreVerdict: string;
    scoreNote: string;
    /** G4: stage ① read only the first JD_MAX_CHARS characters. */
    truncated: boolean;
    /** G3/IN-6: a requirement was excluded before it ever became a row. */
    protectedNotice: string | null;
    /** F22 §3.5 — this analysis started from a saved listing. */
    fromSavedJob: boolean;
  };
  requirements: DomainRequirement[];
  coverage: DomainCoverageItem[];
  bulletTexts: Record<string, string>;
}) {
  const byId = new Map(coverage.map((c) => [c.requirementId, c]));
  const buckets = {
    evidenced: requirements.filter((r) => byId.get(r.id)?.status === "evidenced"),
    partial: requirements.filter((r) => byId.get(r.id)?.status === "partial"),
    absent: requirements.filter((r) => (byId.get(r.id)?.status ?? "absent") === "absent"),
  };

  const meta = [
    { key: "company", value: analysis.company },
    { key: "location", value: analysis.location },
    { key: "seniority", value: analysis.seniority },
    { key: "type", value: analysis.employmentType },
  ].filter((m): m is typeof m & { value: string } => Boolean(m.value) && m.value !== "unstated");
  const total = requirements.length;

  return (
    <div>
      <p className="mb-3 flex flex-wrap items-center gap-2.5 text-[15px] sm:text-[17px]">
        <Link href="/history" className="font-bold no-underline">
          History
        </Link>
        <span aria-hidden className="h-1 w-1 rounded-[var(--radius-pill)] bg-[var(--color-text)]" />
        <span className="text-[var(--color-text-muted)]">{analysis.title ?? "This role"}</span>
      </p>

      <div className="grid items-start gap-[clamp(1.25rem,3vw,2.5rem)] lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <p className="eyebrow mb-2 flex flex-wrap items-center gap-2">
            Analysis complete ·{" "}
            {analysis.jdSource === "upload" ? (analysis.jdFilename ?? "uploaded file") : "pasted text"}
            {analysis.fromSavedJob ? (
              <Tag tone="sage" className="normal-case tracking-normal">
                From your saved job
              </Tag>
            ) : null}
          </p>

          {/* G4/G3: what stage ① did to the posting before reading it, stated
              plainly rather than left silent. Neutral tone, no accusatory
              colour — the same register PROTECTED_NOTICE already uses. */}
          {analysis.truncated || analysis.protectedNotice ? (
            <p className="mb-2 max-w-[60ch] text-xs leading-relaxed text-[var(--color-text-muted)]">
              {analysis.truncated
                ? "This posting was long — we read the first part and told you what we used. "
                : ""}
              {analysis.protectedNotice ?? ""}
            </p>
          ) : null}

          <h1 className="mb-2 break-words text-[clamp(1.75rem,3.6vw,3rem)]">
            {analysis.title ?? "This role"}
          </h1>
          {meta.length ? (
            <p className="mb-3 text-[15px] text-[var(--color-text-muted)] sm:text-[17px]">
              {meta.map((m) => m.value).join(" · ")}
            </p>
          ) : null}
          <p className="mb-1 text-[17px] font-extrabold">{analysis.scoreVerdict}</p>
          <p className="max-w-[56ch] text-[15px] leading-relaxed text-[var(--color-text-muted)] sm:text-base">
            {analysis.scoreNote}
          </p>
          <InfoNote className="mt-3">
            Requirement coverage: how much of this posting your profile can evidence. Not a
            prediction, and not an employer&rsquo;s ATS score.
          </InfoNote>
        </div>

        {/* N4: the ring is requirement coverage, and its three bucket counts
            are in this same card — never one without the other, at any width. */}
        <div
          data-tour="score"
          className="flex flex-wrap items-center gap-5 rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)] px-5 py-4"
        >
          <svg
            width="112"
            height="112"
            viewBox="0 0 120 120"
            className="flex-none"
            role="img"
            aria-label={`${analysis.score.toFixed(0)} percent of this posting's requirements are evidenced by your profile`}
          >
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--color-bg-tint)" strokeWidth="11" />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="var(--color-accent-500)"
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={scoreDash(analysis.score, CIRCUMFERENCE)}
              transform="rotate(-90 60 60)"
            />
            <text
              x="60"
              y="66"
              textAnchor="middle"
              fontSize="40"
              fontFamily="var(--font-heading)"
              fill="var(--color-text)"
            >
              {analysis.score.toFixed(0)}
            </text>
            <text
              x="60"
              y="84"
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fontFamily="var(--font-body)"
              fill="var(--color-text-muted)"
            >
              match
            </text>
          </svg>
          <div className="min-w-[11rem] flex-1">
            <p className="text-base font-semibold">Requirement coverage</p>
            <p className="mb-2.5 text-sm text-[var(--color-text-muted)]">{`№ ${total} requirement${total === 1 ? "" : "s"}`}</p>
            <ul className="flex flex-col gap-1.5 text-sm">
              {BUCKETS.map(({ tone, title }) => (
                <li key={tone} data-bucket={tone} className="flex items-center justify-between gap-4">
                  <span>{title}</span>
                  <strong className={`tag min-h-7 px-2.5 ${BUCKET_TONE[tone].pill}`}>{buckets[tone].length}</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <details data-tour="coverage" className="group mt-[clamp(1rem,2vw,1.5rem)]">
        <summary className="tag tag-outline min-h-[38px] cursor-pointer list-none px-4 text-sm font-extrabold [&::-webkit-details-marker]:hidden">
          Every requirement, sorted by evidence{" "}
          <ChevronDown className="lucide h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-4 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
          {BUCKETS.map(({ tone, title }) => (
            <Bucket
              key={tone}
              title={title}
              tone={tone}
              requirements={buckets[tone]}
              coverage={byId}
              bulletTexts={bulletTexts}
            />
          ))}
        </div>
      </details>
    </div>
  );
}

/** Card and pill paint per bucket: outline on paper, marigold, pink. */
const BUCKET_TONE = {
  evidenced: { card: "bg-[var(--color-bg-raised)]", pill: "border-[var(--color-text)] bg-transparent" },
  partial: { card: "bg-[var(--color-accent-100)]", pill: "border-transparent bg-[var(--color-accent-500)]" },
  absent: { card: "bg-[var(--color-sage-200)]", pill: "border-transparent bg-[var(--color-sage-500)]" },
} as const;

function Bucket({
  title,
  tone,
  requirements,
  coverage,
  bulletTexts,
}: {
  title: string;
  tone: keyof typeof BUCKET_TONE;
  requirements: DomainRequirement[];
  coverage: Map<string, DomainCoverageItem>;
  bulletTexts: Record<string, string>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const paint = BUCKET_TONE[tone];
  const open = requirements.find((r) => r.id === openId);
  const item = open ? coverage.get(open.id) : undefined;
  const evidence = (item?.evidenceBulletIds ?? []).map((id) => bulletTexts[id]).filter(Boolean);

  return (
    // min-w-0: a grid item defaults to min-width:auto, so without this a long
    // requirement widens the whole track instead of wrapping inside the card.
    <div className={`min-w-0 rounded-[var(--radius-lg)] px-4 pb-5 pt-4 sm:px-[22px] sm:pb-6 sm:pt-[22px] ${paint.card}`}>
      <div className="mb-4 flex items-center gap-2.5">
        <h3 className="text-[19px]">{title}</h3>
        <span className="grid h-7 min-w-7 place-items-center rounded-[var(--radius-pill)] bg-[var(--color-text)] px-2 text-[13px] font-extrabold text-[var(--color-accent-500)]">
          {requirements.length}
        </span>
      </div>

      {requirements.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">Nothing in this bucket.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {requirements.map((r) => {
            const selected = openId === r.id;
            return (
              <li key={r.id} className="min-w-0 max-w-full">
                {/* A requirement without a catalog skill falls back to the
                    posting's own sentence, so the pill has to wrap (N9 —
                    .tag-long is the DS variant, not a local override). */}
                <button
                  type="button"
                  aria-expanded={selected}
                  onClick={() => setOpenId(selected ? null : r.id)}
                  className={`tag min-h-[34px] px-3.5 text-left text-sm ${
                    r.skillName ? "" : "tag-long"
                  } ${
                    selected
                      ? "border-[var(--color-text)] bg-[var(--color-text)] text-[var(--color-accent-500)]"
                      : paint.pill
                  }`}
                >
                  {r.skillName ?? r.text}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open ? (
        <div className="rise-in mt-3.5 break-words rounded-[var(--radius-md)] bg-[rgb(255_255_255/0.7)] px-4 py-3.5 text-sm leading-[1.55]">
          <p className="mb-2">{open.text}</p>
          <p className="mb-2 text-[var(--color-text-muted)]">
            {item?.rationale ?? "Nothing in your profile evidences this yet."}
          </p>
          {evidence.length > 0 ? (
            <>
              <p className="mb-1 font-extrabold">From your profile:</p>
              <ul className="mb-2 list-disc space-y-1 pl-4">
                {evidence.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="text-xs text-[var(--color-text-muted)]">
            The posting says: &ldquo;{open.evidenceQuote}&rdquo;
          </p>
        </div>
      ) : null}
    </div>
  );
}

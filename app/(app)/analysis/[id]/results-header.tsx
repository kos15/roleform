"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Clock3, MapPin, Star } from "lucide-react";
import { Tag } from "@/components/ui";
import { InfoNote } from "@/components/info-note";
import { TemplatePaper } from "@/components/template-thumb";
import { templateById } from "@/lib/render/templates";
import { scoreDash } from "@/lib/domain/coverage";
import type { DomainCoverageItem, DomainRequirement } from "@/lib/domain/types";

/**
 * F4 — the score ring, its verdict, and the three buckets beside it.
 *
 * N4: this number is requirement coverage. It is never labelled "ATS score",
 * and it is never rendered without the buckets — the word "ATS" appears in this
 * product only on a template badge.
 *
 * Every Strong-match tag expands to its source bullet in one click (M3.8).
 */
const CIRCUMFERENCE = 2 * Math.PI * 52;

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
    { key: "company", value: analysis.company, icon: Building2 },
    { key: "location", value: analysis.location, icon: MapPin },
    { key: "seniority", value: analysis.seniority, icon: Star },
    { key: "type", value: analysis.employmentType, icon: Clock3 },
  ].filter((m): m is typeof m & { value: string } => Boolean(m.value) && m.value !== "unstated");
  const papers = [templateById("margin-note"), templateById("clean-slate")];

  return (
    <div>
      <p className="mb-[clamp(1.25rem,3vw,2.5rem)] flex flex-wrap items-center gap-2.5 text-[17px]">
        <Link href="/history" className="font-bold no-underline">
          History
        </Link>
        <span aria-hidden className="h-1 w-1 rounded-[var(--radius-pill)] bg-[var(--color-text)]" />
        <span className="text-[var(--color-text-muted)]">{analysis.title ?? "This role"}</span>
      </p>

      <div className="grid items-end gap-[clamp(2rem,4vw,4rem)] [grid-template-columns:repeat(auto-fit,minmax(min(440px,100%),1fr))]">
        <div>
          <p className="eyebrow mb-4 flex flex-wrap items-center gap-2">
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
            <p className="mb-4 max-w-[60ch] text-xs leading-relaxed text-[var(--color-text-muted)]">
              {analysis.truncated
                ? "This posting was long — we read the first part and told you what we used. "
                : ""}
              {analysis.protectedNotice ?? ""}
            </p>
          ) : null}

          <h1 className="mb-[22px] text-[clamp(3.25rem,7.8vw,7.6rem)]">
            {analysis.title ?? "This role"}
          </h1>
          {meta.length ? (
            <p className="mb-[18px] text-[17px] text-[var(--color-text-muted)]">
              {meta.map((m) => m.value).join(" · ")}
            </p>
          ) : null}
          <p className="mb-1 text-[17px] font-extrabold">{analysis.scoreVerdict}</p>
          <p className="max-w-[56ch] text-base leading-relaxed text-[var(--color-text-muted)]">
            {analysis.scoreNote}
          </p>
        </div>

        <div className="flex flex-wrap items-stretch gap-[22px] pt-[52px]">
          {/* N4: the ring is requirement coverage, and the three buckets are
              directly below it — never one without the other. */}
          <div
            data-tour="score"
            className="relative flex min-h-[320px] flex-[1_1_220px] flex-col items-center rounded-[26px] bg-[var(--color-bg-raised)] px-[22px] pb-11 pt-[30px] text-center"
          >
            <span className="tag tag-outline absolute -top-[52px] left-1/2 min-h-10 -translate-x-1/2 bg-[var(--color-bg)] px-4 text-[15px] font-extrabold">
              № {requirements.length} requirement{requirements.length === 1 ? "" : "s"}
            </span>
            <svg
              width="156"
              height="156"
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
            <span className="mt-2.5 text-base font-semibold">Requirement coverage</span>
            <span className="absolute -bottom-[18px] left-1/2 flex min-h-[38px] -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] bg-[var(--color-sage-500)] px-[18px] text-sm">
              Evidenced:
              <strong>
                {buckets.evidenced.length} of {requirements.length}
              </strong>
            </span>
          </div>

          <div
            aria-hidden
            className="relative min-h-[320px] flex-[1.35_1_280px] rounded-[26px] bg-[var(--color-accent-500)] px-6 py-7"
          >
            <div className="relative z-[2] flex flex-col items-start gap-[13px]">
              {meta.map(({ key, value, icon: Icon }) => (
                <span
                  key={key}
                  className="tag tag-outline min-h-[38px] max-w-full bg-[var(--color-accent-500)] px-[15px] text-[15px]"
                >
                  <Icon className="lucide h-[15px] w-[15px] flex-none" />
                  <span className="truncate">{value}</span>
                </span>
              ))}
            </div>
            {papers[0] ? (
              <TemplatePaper
                template={papers[0]}
                className="absolute bottom-6 right-[22px] h-[186px] w-[140px] rotate-[8deg] rounded-[10px] shadow-[var(--shadow-lg)]"
              />
            ) : null}
            {papers[1] ? (
              <TemplatePaper
                template={papers[1]}
                className="absolute -top-11 right-[62px] z-[1] h-[200px] w-[150px] -rotate-[3deg] rounded-[10px] shadow-[var(--shadow-lg)]"
              />
            ) : null}
          </div>
        </div>
      </div>

      <div
        data-tour="coverage"
        className="mt-[clamp(3rem,6vw,5rem)] grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]"
      >
        <Bucket
          title="Strong match"
          tone="evidenced"
          requirements={buckets.evidenced}
          coverage={byId}
          bulletTexts={bulletTexts}
        />
        <Bucket
          title="Partial evidence"
          tone="partial"
          requirements={buckets.partial}
          coverage={byId}
          bulletTexts={bulletTexts}
        />
        <Bucket
          title="Not evidenced"
          tone="absent"
          requirements={buckets.absent}
          coverage={byId}
          bulletTexts={bulletTexts}
        />
      </div>

      <InfoNote className="mt-[26px]">
        This is requirement coverage — how much of this posting your own profile can evidence.
        It isn&rsquo;t a prediction, and no employer&rsquo;s system produced it.
      </InfoNote>
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
    <div className={`min-w-0 rounded-[var(--radius-lg)] px-[22px] pb-6 pt-[22px] ${paint.card}`}>
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

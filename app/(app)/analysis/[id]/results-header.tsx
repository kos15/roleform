"use client";

import { useState } from "react";
import { Card, Tag } from "@/components/ui";
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

  return (
    <div>
      <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        Analysis complete · {analysis.jdSource === "upload" ? (analysis.jdFilename ?? "uploaded file") : "pasted text"}
      </p>

      {/* One wrapping row, not a nested rigid one: the ring keeps its 120px and
          the verdict takes a 280px basis, so on a phone the text drops to its
          own line instead of squeezing the ring to a coin beside three-line
          title. Matches the design's own `flex:none` / `min-width:280px`. */}
      <div className="mb-6 flex flex-wrap items-center gap-6">
        <svg width="120" height="120" viewBox="0 0 120 120" className="flex-none" role="img" aria-label={`${analysis.score.toFixed(0)} percent of this posting's requirements are evidenced by your profile`}>
          <circle cx="60" cy="60" r="52" fill="none" stroke="var(--color-bg-sunken)" strokeWidth="12" />
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke="var(--color-accent-500)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={scoreDash(analysis.score, CIRCUMFERENCE)}
            transform="rotate(-90 60 60)"
          />
          <text
            x="60"
            y="57"
            textAnchor="middle"
            fontSize="28"
            fontFamily="var(--font-heading)"
            fill="var(--color-text)"
          >
            {analysis.score.toFixed(0)}
          </text>
          <text x="60" y="76" textAnchor="middle" fontSize="12" fill="var(--color-text-muted)">
            match
          </text>
        </svg>

        <div className="min-w-[min(280px,100%)] flex-1">
          <h1 className="mb-1 text-3xl">{analysis.title ?? "This role"}</h1>
          <p className="mb-3 text-[var(--color-text-muted)]">
            {[analysis.company, analysis.location, analysis.seniority, analysis.employmentType]
              .filter((v) => v && v !== "unstated")
              .join(" · ")}
          </p>
          <p className="font-semibold">{analysis.scoreVerdict}</p>
          <p className="max-w-[56ch] text-[var(--color-text-muted)]">{analysis.scoreNote}</p>
        </div>
      </div>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
        <Bucket
          title="Strong match"
          tone="sage"
          requirements={buckets.evidenced}
          coverage={byId}
          bulletTexts={bulletTexts}
        />
        <Bucket
          title="Partial evidence"
          tone="warn"
          requirements={buckets.partial}
          coverage={byId}
          bulletTexts={bulletTexts}
        />
        <Bucket
          title="Not evidenced"
          tone="accent"
          requirements={buckets.absent}
          coverage={byId}
          bulletTexts={bulletTexts}
        />
      </div>

      <p className="mt-4 max-w-2xl text-sm text-[var(--color-text-muted)]">
        This is requirement coverage — how much of this posting your own profile can evidence.
        It isn&rsquo;t a prediction, and no employer&rsquo;s system produced it.
      </p>
    </div>
  );
}

function Bucket({
  title,
  tone,
  requirements,
  coverage,
  bulletTexts,
}: {
  title: string;
  tone: "sage" | "warn" | "accent";
  requirements: DomainRequirement[];
  coverage: Map<string, DomainCoverageItem>;
  bulletTexts: Record<string, string>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    // min-w-0: a grid item defaults to min-width:auto, so without this a long
    // requirement widens the whole track instead of wrapping inside the card.
    <Card className="min-w-0">
      <div className="mb-3 flex items-baseline gap-2">
        <h3>{title}</h3>
        <Tag tone={tone}>{requirements.length}</Tag>
      </div>

      {requirements.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">Nothing in this bucket.</p>
      ) : (
        <ul className="space-y-2">
          {requirements.map((r) => {
            const item = coverage.get(r.id);
            const evidence = (item?.evidenceBulletIds ?? [])
              .map((id) => bulletTexts[id])
              .filter(Boolean);
            const open = openId === r.id;

            return (
              <li key={r.id} className="min-w-0">
                <button
                  type="button"
                  className="w-full min-w-0 text-left text-sm"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : r.id)}
                >
                  {/* A requirement without a catalog skill falls back to the
                      posting's own sentence, so the pill has to wrap (N9 —
                      .tag-long is the DS variant, not a local override). */}
                  <Tag tone={tone} className={r.skillName ? undefined : "tag-long"}>
                    {r.skillName ?? r.text}
                  </Tag>
                </button>

                {open ? (
                  <div className="mt-2 break-words rounded-[var(--radius-md)] bg-[var(--color-bg-sunken)] p-3 text-sm">
                    <p className="mb-2">{r.text}</p>
                    <p className="mb-2 text-[var(--color-text-muted)]">
                      {item?.rationale ?? "Nothing in your profile evidences this yet."}
                    </p>
                    {evidence.length > 0 ? (
                      <>
                        <p className="mb-1 font-semibold">From your profile:</p>
                        <ul className="list-disc space-y-1 pl-4">
                          {evidence.map((text, i) => (
                            <li key={i}>{text}</li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                      The posting says: &ldquo;{r.evidenceQuote}&rdquo;
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

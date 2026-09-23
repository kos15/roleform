"use client";

import { useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Button, Card, Input, Tag, Textarea } from "@/components/ui";
import type { ExtractProfileResult, ResumeJson } from "@/lib/ai/schemas/resume-json";

/**
 * The MANDATORY review screen (M2.3, F1).
 *
 * Every field is editable and nothing commits without an explicit confirm. This
 * screen is also the only place ambiguous dates and career gaps surface — they
 * are shown neutrally and never auto-filled or concealed (specs §13).
 */
export function ReviewScreen({
  draft,
  filename,
  onCommit,
  onStartOver,
}: {
  draft: ExtractProfileResult;
  filename: string;
  onCommit: (resume: ResumeJson) => void;
  onStartOver: () => void;
}) {
  const [resume, setResume] = useState<ResumeJson>(draft.resume);

  const bulletCount = resume.work.reduce((n, w) => n + w.highlights.length, 0);

  function updateWork(index: number, patch: Partial<ResumeJson["work"][number]>) {
    setResume((r) => ({
      ...r,
      work: r.work.map((w, i) => (i === index ? { ...w, ...patch } : w)),
    }));
  }

  function updateHighlight(workIndex: number, highlightIndex: number, text: string) {
    setResume((r) => ({
      ...r,
      work: r.work.map((w, i) =>
        i === workIndex
          ? { ...w, highlights: w.highlights.map((h, j) => (j === highlightIndex ? text : h)) }
          : w,
      ),
    }));
  }

  function removeHighlight(workIndex: number, highlightIndex: number) {
    setResume((r) => ({
      ...r,
      work: r.work.map((w, i) =>
        i === workIndex
          ? { ...w, highlights: w.highlights.filter((_, j) => j !== highlightIndex) }
          : w,
      ),
    }));
  }

  function addHighlight(workIndex: number) {
    setResume((r) => ({
      ...r,
      work: r.work.map((w, i) =>
        i === workIndex ? { ...w, highlights: [...w.highlights, ""] } : w,
      ),
    }));
  }

  const canSave = bulletCount > 0 && resume.basics.name.trim().length > 0;

  return (
    <div className="space-y-[18px]">
      <div className="flex flex-wrap items-center gap-2.5 rounded-[22px] bg-[var(--color-accent-500)] px-5 py-4">
        <strong className="text-base">{filename}</strong>
        <Tag tone="ink" className="min-h-[30px] font-extrabold">
          Read
        </Tag>
        <Tag tone="outline" className="min-h-[30px]">
          {resume.work.length} role{resume.work.length === 1 ? "" : "s"}
        </Tag>
        <Tag tone="outline" className="min-h-[30px]">
          {bulletCount} bullet{bulletCount === 1 ? "" : "s"}
        </Tag>
        <span className="ml-auto text-sm">Check it, fix anything we misread, then save.</span>
      </div>

      {draft.notices.ambiguousDates.length > 0 || draft.notices.careerGaps.length > 0 ? (
        <div className="rounded-[22px] bg-[var(--color-sage-200)] px-[22px] py-5">
          <div className="mb-2.5 flex items-center gap-2 text-base font-extrabold">
            <AlertTriangle className="lucide h-[17px] w-[17px]" />
            Worth a look
          </div>
          <ul className="list-disc space-y-1.5 pl-[18px] text-[15px] leading-normal">
            {draft.notices.ambiguousDates.map((d) => (
              <li key={d.path}>
                We couldn&rsquo;t read a date confidently near <code>{d.path}</code> (
                {d.raw || "blank"}). Set it below rather than let us guess.
              </li>
            ))}
            {draft.notices.careerGaps.map((g) => (
              <li key={g.afterPath}>
                A {g.months}-month gap follows <code>{g.afterPath}</code>. Noted, not hidden —
                it&rsquo;s yours to explain how you want.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card className="p-[clamp(1.25rem,2.6vw,1.75rem)]">
        <h3 className="display mb-4 text-[30px] font-normal">You</h3>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(14rem,100%),1fr))]">
          <Input
            aria-label="Full name"
            placeholder="Full name"
            value={resume.basics.name}
            onChange={(e) =>
              setResume((r) => ({ ...r, basics: { ...r.basics, name: e.target.value } }))
            }
          />
          <Input
            aria-label="Headline"
            placeholder="Headline"
            value={resume.basics.label}
            onChange={(e) =>
              setResume((r) => ({ ...r, basics: { ...r.basics, label: e.target.value } }))
            }
          />
          <Input
            aria-label="Email"
            placeholder="Email"
            value={resume.basics.email}
            onChange={(e) =>
              setResume((r) => ({ ...r, basics: { ...r.basics, email: e.target.value } }))
            }
          />
          <Input
            aria-label="Phone"
            placeholder="Phone"
            value={resume.basics.phone}
            onChange={(e) =>
              setResume((r) => ({ ...r, basics: { ...r.basics, phone: e.target.value } }))
            }
          />
        </div>
      </Card>

      {resume.work.map((work, wi) => (
        <Card key={wi} className="p-[clamp(1.25rem,2.6vw,1.75rem)]">
          <div className="mb-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(14rem,100%),1fr))]">
            <Input
              aria-label="Position"
              placeholder="Position"
              value={work.position}
              onChange={(e) => updateWork(wi, { position: e.target.value })}
            />
            <Input
              aria-label="Employer"
              placeholder="Employer"
              value={work.name}
              onChange={(e) => updateWork(wi, { name: e.target.value })}
            />
            <Input
              aria-label="Start date"
              placeholder="Start (YYYY-MM)"
              value={work.startDate}
              onChange={(e) => updateWork(wi, { startDate: e.target.value })}
            />
            <Input
              aria-label="End date"
              placeholder="End (YYYY-MM, blank if current)"
              value={work.endDate ?? ""}
              onChange={(e) => updateWork(wi, { endDate: e.target.value || null })}
            />
          </div>

          <div className="space-y-2.5">
            {work.highlights.map((highlight, hi) => (
              <div key={hi} className="flex items-start gap-2">
                <Textarea
                  aria-label={`Bullet ${hi + 1}`}
                  rows={2}
                  value={highlight}
                  onChange={(e) => updateHighlight(wi, hi, e.target.value)}
                />
                <Button
                  variant="ghost"
                  aria-label="Remove bullet"
                  className="h-11 w-11 flex-none px-0 hover:bg-[var(--color-sage-200)]"
                  onClick={() => removeHighlight(wi, hi)}
                >
                  <Trash2 className="lucide h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => addHighlight(wi)}>
              <Plus className="lucide h-4 w-4" /> Add bullet
            </Button>
          </div>
        </Card>
      ))}

      <div className="flex flex-wrap items-center gap-3 pt-1.5">
        <Button size="lg" onClick={() => onCommit(resume)} disabled={!canSave}>
          Save profile
        </Button>
        <Button variant="secondary" size="lg" onClick={onStartOver}>
          Upload a different file
        </Button>
        {!canSave ? (
          <span className="text-sm text-[var(--color-text-muted)]">
            Needs a name and at least one bullet.
          </span>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Button, Card, Input, Tag, Textarea } from "@/components/ui";
import type { DraftResume, ExtractProfileResult } from "@/lib/ai/schemas/resume-json";
import { ISO_DATE } from "@/lib/domain/profile-draft";

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
  saving = false,
  onCommit,
  onStartOver,
}: {
  draft: ExtractProfileResult;
  filename: string;
  saving?: boolean;
  onCommit: (resume: DraftResume) => void;
  onStartOver: () => void;
}) {
  const [resume, setResume] = useState<DraftResume>(draft.resume);

  const bulletCount = resume.work.reduce((n, w) => n + w.highlights.length, 0);

  function updateWork(index: number, patch: Partial<DraftResume["work"][number]>) {
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

  // The commit runs the strict schema; say here, in words, what it would
  // reject, so Save is never a button that fails with "some fields".
  const missing: string[] = [];
  if (!resume.basics.name.trim()) missing.push("your name");
  if (bulletCount === 0) missing.push("at least one bullet");
  resume.work.forEach((w, i) => {
    const role = w.position.trim() || w.name.trim() || `role ${i + 1}`;
    if (!w.position.trim()) missing.push(`a position for ${role}`);
    if (!w.name.trim()) missing.push(`an employer for ${role}`);
    if (!w.startDate || !ISO_DATE.test(w.startDate)) missing.push(`a start date (YYYY-MM) for ${role}`);
    if (w.endDate && !ISO_DATE.test(w.endDate)) missing.push(`an end date in YYYY-MM for ${role}`);
    if (w.highlights.some((h) => !h.trim())) missing.push(`text in an empty bullet under ${role}`);
  });
  const canSave = missing.length === 0 && !saving;
  const hasNotices =
    draft.notices.ambiguousDates.length > 0 ||
    draft.notices.careerGaps.length > 0 ||
    draft.notices.readFromImage ||
    draft.notices.clipped;

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

      {hasNotices ? (
        <div data-help="ob-flags" className="rounded-[22px] bg-[var(--color-sage-200)] px-[22px] py-5">
          <div className="mb-2.5 flex items-center gap-2 text-base font-extrabold">
            <AlertTriangle className="lucide h-[17px] w-[17px]" />
            Worth a look
          </div>
          <ul className="list-disc space-y-1.5 pl-[18px] text-[15px] leading-normal">
            {draft.notices.readFromImage ? (
              <li>We read this from an image. Check names, dates and numbers closely.</li>
            ) : null}
            {draft.notices.clipped ? (
              <li>Your document was very long, so we read the first part only. Add anything missing below.</li>
            ) : null}
            {draft.notices.ambiguousDates.map((d) => (
              <li key={d.path}>
                We couldn&rsquo;t read the {describePath(draft.resume, d.path)} (&ldquo;{d.raw || "blank"}&rdquo;).{" "}
                {d.path.startsWith("work.")
                  ? "Set it below rather than let us guess."
                  : "We left it blank; you can add it on your profile after saving."}
              </li>
            ))}
            {draft.notices.careerGaps.map((g) => (
              <li key={g.afterPath}>
                A {g.months}-month gap follows {describePath(draft.resume, g.afterPath)}. Noted, not hidden —
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
              value={work.startDate ?? ""}
              aria-invalid={!work.startDate || !ISO_DATE.test(work.startDate)}
              onChange={(e) => updateWork(wi, { startDate: e.target.value.trim() || null })}
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
        <Button size="lg" data-help="ob-save" onClick={() => onCommit(resume)} disabled={!canSave}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
        <Button variant="secondary" size="lg" onClick={onStartOver} disabled={saving}>
          Upload a different file
        </Button>
        {missing.length > 0 ? (
          <span className="text-sm text-[var(--color-text-muted)]">
            Still needs {missing.slice(0, 3).join(", ")}
            {missing.length > 3 ? ` and ${missing.length - 3} more` : ""}.
          </span>
        ) : null}
      </div>
    </div>
  );
}

const FIELD: Record<string, string> = {
  startDate: "start date",
  endDate: "end date",
  date: "date",
};

/** "work.2.startDate" → "start date of Engineer at Acme". Paths are ours, not the user's. */
function describePath(resume: DraftResume, path: string): string {
  const [section, index, field] = path.split(".");
  const i = Number(index);
  let subject = "";
  if (section === "work") {
    const w = resume.work[i];
    subject = w ? [w.position, w.name].filter(Boolean).join(" at ") : "";
  } else if (section === "education") subject = resume.education[i]?.institution ?? "";
  else if (section === "projects") subject = resume.projects[i]?.name ?? "";
  else if (section === "certificates") subject = resume.certificates[i]?.name ?? "";
  else if (section === "volunteer") subject = resume.volunteer[i]?.organization ?? "";
  else if (section === "awards") subject = resume.awards[i]?.title ?? "";
  subject ||= `${section} entry ${i + 1}`;
  return field ? `${FIELD[field] ?? field} of ${subject}` : subject;
}

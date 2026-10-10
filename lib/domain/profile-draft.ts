/**
 * Extraction draft → reviewable draft (F1). PURE.
 *
 * The model is allowed to hand back a date as printed ("Jan 2020", "03/2019",
 * "Present") and to leave a name empty, because failing a whole résumé over
 * one of those was the main reason extraction failed. This module does the
 * deterministic half: every date becomes ISO or null, every date it cannot
 * read is listed for the review screen, empty entries are dropped, and career
 * gaps are computed here rather than estimated by the model.
 *
 * It never guesses a month (F1 acceptance): a date with no legible month comes
 * out as a year, and one with no legible year comes out null with a notice.
 */

import type { DraftResume, ExtractionNotices } from "@/lib/ai/schemas/resume-json";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const CURRENT = /^(present|current|currently|now|today|ongoing|to date|till date|till now|until now|date)$/i;
const SEASON = /^(spring|summer|autumn|fall|winter)\s+(\d{4})$/i;

export type DateReading =
  | { kind: "iso"; value: string }
  | { kind: "current" }
  | { kind: "absent" }
  | { kind: "unreadable"; raw: string };

export function readDate(raw: string | null | undefined, nowYear: number): DateReading {
  const text = (raw ?? "").trim().replace(/\.$/, "");
  if (!text) return { kind: "absent" };
  if (CURRENT.test(text)) return { kind: "current" };

  const plausible = (y: number) => y >= 1950 && y <= nowYear + 6;
  const iso = (y: number, m?: number): DateReading => {
    if (!plausible(y)) return { kind: "unreadable", raw: text };
    if (m === undefined) return { kind: "iso", value: String(y) };
    if (m < 1 || m > 12) return { kind: "unreadable", raw: text };
    return { kind: "iso", value: `${y}-${String(m).padStart(2, "0")}` };
  };

  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})$/.exec(text))) return iso(Number(m[1]));
  if ((m = /^(\d{4})[-/.](\d{1,2})$/.exec(text))) return iso(Number(m[1]), Number(m[2]));
  if ((m = /^(\d{1,2})[-/.](\d{4})$/.exec(text))) return iso(Number(m[2]), Number(m[1]));
  // A full date: keep year and month, drop the day.
  if ((m = /^(\d{4})-(\d{2})-\d{2}$/.exec(text))) return iso(Number(m[1]), Number(m[2]));
  // A season names a year, not a month: keep the year only.
  if ((m = SEASON.exec(text))) return iso(Number(m[2]));
  if ((m = /^([a-z]+)\.?,?\s+(\d{4})$/i.exec(text))) {
    const month = MONTHS[m[1]!.toLowerCase()];
    return month ? iso(Number(m[2]), month) : { kind: "unreadable", raw: text };
  }
  return { kind: "unreadable", raw: text };
}

type Notices = Pick<ExtractionNotices, "ambiguousDates" | "careerGaps">;

export function normaliseDraft(draft: DraftResume, now: Date = new Date()): { resume: DraftResume; notices: Notices } {
  const ambiguousDates: Notices["ambiguousDates"] = [];
  const nowYear = now.getFullYear();

  /** `allowCurrent`: "Present" is a valid end, never a valid start. */
  const date = (raw: string | null, path: string, allowCurrent: boolean): string | null => {
    const r = readDate(raw, nowYear);
    if (r.kind === "iso") return r.value;
    if (r.kind === "current" && allowCurrent) return null;
    if (r.kind === "absent") return null;
    ambiguousDates.push({ path, raw: r.kind === "unreadable" ? r.raw : (raw ?? "") });
    return null;
  };
  const t = (s: string) => s.trim();
  const lines = (xs: string[]) => xs.map(t).filter(Boolean);

  const work = draft.work
    .map((w) => ({ ...w, name: t(w.name), position: t(w.position), highlights: lines(w.highlights) }))
    .filter((w) => w.name || w.position || w.highlights.length > 0)
    .map((w, i) => ({
      ...w,
      startDate: date(w.startDate, `work.${i}.startDate`, false),
      endDate: date(w.endDate, `work.${i}.endDate`, true),
    }));

  const resume: DraftResume = {
    basics: { ...draft.basics, name: t(draft.basics.name) },
    work,
    education: draft.education
      .filter((e) => t(e.institution))
      .map((e, i) => ({
        ...e,
        institution: t(e.institution),
        startDate: date(e.startDate, `education.${i}.startDate`, false),
        endDate: date(e.endDate, `education.${i}.endDate`, true),
      })),
    skills: draft.skills
      .map((s) => ({ ...s, name: t(s.name), keywords: lines(s.keywords) }))
      .filter((s) => s.name || s.keywords.length > 0)
      // A bare keyword list with no group heading keeps the résumé's own
      // label-less shape under the plain name the prompt asks for.
      .map((s) => ({ ...s, name: s.name || "Skills" })),
    projects: draft.projects
      .map((p) => ({ ...p, highlights: lines(p.highlights) }))
      .filter((p) => t(p.name) || p.highlights.length > 0 || t(p.description))
      .map((p, i) => ({
        ...p,
        // A project with no title keeps its own first words as its label.
        name: t(p.name) || firstWords(t(p.description) || p.highlights[0] || ""),
        startDate: date(p.startDate, `projects.${i}.startDate`, false),
        endDate: date(p.endDate, `projects.${i}.endDate`, true),
      })),
    certificates: draft.certificates
      .filter((c) => t(c.name))
      .map((c, i) => ({ ...c, name: t(c.name), date: date(c.date, `certificates.${i}.date`, false) })),
    volunteer: draft.volunteer
      .filter((v) => t(v.organization))
      .map((v, i) => ({
        ...v,
        organization: t(v.organization),
        highlights: lines(v.highlights),
        startDate: date(v.startDate, `volunteer.${i}.startDate`, false),
        endDate: date(v.endDate, `volunteer.${i}.endDate`, true),
      })),
    awards: draft.awards
      .filter((a) => t(a.title))
      .map((a, i) => ({ ...a, title: t(a.title), date: date(a.date, `awards.${i}.date`, false) })),
    languages: draft.languages.filter((l) => t(l.language)),
  };

  return { resume, notices: { ambiguousDates, careerGaps: careerGaps(resume.work, now) } };
}

/**
 * Gaps of 4+ months between roles, by date rather than by list order —
 * overlapping roles and a résumé listed oldest-first both come out right.
 */
export function careerGaps(
  work: Array<{ startDate: string | null; endDate: string | null }>,
  now: Date = new Date(),
): Notices["careerGaps"] {
  const spans = work
    .map((w, index) => {
      const start = toMonths(w.startDate, "start");
      const end = w.endDate ? toMonths(w.endDate, "end") : now.getFullYear() * 12 + now.getMonth();
      return start === null || end === null ? null : { index, start, end };
    })
    .filter((s): s is { index: number; start: number; end: number } => s !== null)
    .sort((a, b) => a.start - b.start);

  const gaps: Notices["careerGaps"] = [];
  let latest: { index: number; end: number } | null = null;
  for (const span of spans) {
    if (latest && span.start - latest.end >= 4) {
      gaps.push({ afterPath: `work.${latest.index}`, months: span.start - latest.end });
    }
    if (!latest || span.end > latest.end) latest = { index: span.index, end: span.end };
  }
  return gaps;
}

/**
 * A year alone is read as January for a start and December for an end — the
 * reading with the smallest gap, so a year-only résumé is never told about a
 * gap it may not have.
 */
function toMonths(iso: string | null, edge: "start" | "end"): number | null {
  if (!iso) return null;
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(iso);
  if (!m) return null;
  return Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : edge === "start" ? 0 : 11);
}

function firstWords(s: string): string {
  const words = s.split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
  return words.length > 60 ? `${words.slice(0, 57)}…` : words;
}

/** Strict-schema date check, shared by the review screen's Save gate. */
export const ISO_DATE = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

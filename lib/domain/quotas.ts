/**
 * Generation caps (F15). PURE.
 *
 * Four separate caps rather than one credit balance, because the four things
 * cost different amounts and fail at different seams. A member who has run out
 * of answer drafts has not run out of analyses, and telling them they have is
 * the generic-error failure this whole feature exists to remove.
 *
 * The bounds here are mirrored by CHECK constraints on `users` — the migration
 * is the enforcement, this is the vocabulary (CLAUDE.md §11).
 */

export type QuotaKey = "analyses" | "resumes" | "answers" | "courses";

export type QuotaPeriod = "cycle" | "analysis" | "gap";

export interface QuotaDefinition {
  key: QuotaKey;
  /** Column on `users`. */
  column: "capAnalyses" | "capResumes" | "capAnswers" | "capCourses";
  label: string;
  unit: string;
  period: QuotaPeriod;
  step: number;
  min: number;
  max: number;
  description: string;
}

export const QUOTAS: QuotaDefinition[] = [
  {
    key: "analyses",
    column: "capAnalyses",
    label: "JD analyses",
    unit: "per month",
    period: "cycle",
    step: 5,
    min: 0,
    max: 200,
    description:
      "A full pipeline run — reading, matching, rewriting, preparing. The most expensive thing this product does.",
  },
  {
    key: "resumes",
    column: "capResumes",
    label: "Résumés rendered",
    unit: "per analysis",
    period: "analysis",
    step: 1,
    min: 0,
    max: 6,
    description:
      "How many of the six templates render on each run. Below six we render the highest-ATS ones first.",
  },
  {
    key: "answers",
    column: "capAnswers",
    label: "Full answer drafts",
    unit: "per month",
    period: "cycle",
    step: 5,
    min: 0,
    max: 200,
    description:
      "Long-form answers drafted from the member's own bullets. Frameworks stay free — only the drafted answer counts.",
  },
  {
    key: "courses",
    column: "capCourses",
    label: "Course matches",
    unit: "per gap",
    period: "gap",
    step: 1,
    min: 0,
    max: 6,
    description:
      "Vetted catalog matches returned per unevidenced requirement. Gaps are always shown, with or without courses.",
  },
];

export const QUOTA_BY_KEY: Record<QuotaKey, QuotaDefinition> = Object.fromEntries(
  QUOTAS.map((q) => [q.key, q]),
) as Record<QuotaKey, QuotaDefinition>;

/** Snap an admin's typed or clicked value into the constraint the column carries. */
export function clampCap(key: QuotaKey, value: number): number {
  const def = QUOTA_BY_KEY[key];
  if (!Number.isFinite(value)) return def.min;
  return Math.min(def.max, Math.max(def.min, Math.round(value)));
}

/** 0 is a real setting, and it reads as a word rather than a number. */
export function displayCap(value: number): string {
  return value === 0 ? "Off" : String(value);
}

/**
 * The billing cycle is a rolling 30 days from the account's reset date, or from
 * now backwards when no reset has been recorded. Calendar months would make a
 * cap mean something different in February.
 */
export const CYCLE_DAYS = 30;

export function cycleStart(quotaResetsAt: Date | null, now: Date = new Date()): Date {
  const anchor = quotaResetsAt ?? now;
  const start = new Date(anchor);
  while (start > now) start.setDate(start.getDate() - CYCLE_DAYS);
  return start;
}

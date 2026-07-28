/**
 * ATS rating — CLAUDE.md §5, N5. PURE.
 *
 * The rating is computed from structural facts, never hand-assigned. Two-column
 * layouts genuinely parse worse; the badge exists so the user chooses knowingly
 * rather than being sold a false promise.
 *
 * Do NOT tune these rules to flatter the creative templates. They read Low
 * because they are Low, and shipping them honestly is the whole point.
 *
 * Both renderers (pdf/, docx/) import their constraints from this module, so
 * the badge and the artifact can never drift apart.
 */
import type { AtsRating } from "@/lib/domain/types";

export interface StructuralFlags {
  /** Body content flows in a single column. */
  singleColumnBody: boolean;
  /** Section headings are the standard set an ATS maps to fields. */
  standardHeadings: boolean;
  /** No tables, text boxes, or content in header/footer regions. */
  noTablesOrFloats: boolean;
  /** Contact details are body text, not graphics. */
  contactAsBodyText: boolean;
  /** No information conveyed only by icon or colour. */
  noIconOnlyMeaning: boolean;
}

/** The five checks, in the order CLAUDE.md §5 lists them. */
export const ATS_CHECKS: Array<{ key: keyof StructuralFlags; label: string }> = [
  { key: "singleColumnBody", label: "Single-column body flow" },
  { key: "standardHeadings", label: "Standard section headings" },
  { key: "noTablesOrFloats", label: "No tables, text boxes, or header/footer content" },
  { key: "contactAsBodyText", label: "Contact details as body text" },
  { key: "noIconOnlyMeaning", label: "No information conveyed only by icon or colour" },
];

/** All five → High. One violation → Medium. Two or more → Low. */
export function rateAts(flags: StructuralFlags): AtsRating {
  const violations = ATS_CHECKS.filter((c) => !flags[c.key]).length;
  if (violations === 0) return "High";
  if (violations === 1) return "Medium";
  return "Low";
}

export function atsViolations(flags: StructuralFlags): string[] {
  return ATS_CHECKS.filter((c) => !flags[c.key]).map((c) => c.label);
}

/* --------------------------------------------- shared rendering constraints */

/** Standard headings, in the order every template emits them. */
export const SECTION_HEADINGS = [
  "Summary",
  "Experience",
  "Projects",
  "Education",
  "Skills",
  "Certifications",
] as const;

export type SectionHeading = (typeof SECTION_HEADINGS)[number];

/** Dates render MMM YYYY – MMM YYYY consistently across both formats (F9). */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso: string | undefined | null): string {
  if (!iso) return "Present";
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(iso.trim());
  if (!m) return iso;
  const year = m[1];
  const month = m[2] ? MONTHS[Number(m[2]) - 1] : undefined;
  return month ? `${month} ${year}` : year;
}

export function formatRange(start?: string | null, end?: string | null): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

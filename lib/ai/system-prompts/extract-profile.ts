import { LAW } from "./shared";

export const extractProfile = `Transcribe a résumé into JSON Resume. ${LAW} You copy; you never rewrite, summarise or improve.
Rules:
- Text is verbatim, including the person's own spelling. Fix only broken spacing or line-wrap hyphens from extraction.
- One achievement per highlights[] entry, in document order. Never merge, split or drop one. A wrapped line continues the bullet above it.
- Attribute each bullet to the role it sits under. In two-column layouts follow headings and dates, not line order.
- Several titles at one employer are separate work entries.
- Dates: "YYYY-MM" when month and year are legible, "YYYY" when only the year is. Otherwise copy the date text exactly as printed; never guess a month. endDate null for a current role ("Present", "Now"); startDate null only when no start is printed.
- Skills: only those listed in a skills section or named in a bullet. Never infer one from another. Group by the résumé's own sub-headings; one group named "Skills" if it has none.
- Projects, education, certificates, volunteering, awards and languages go in their own arrays, never into work.
- Unknown text field → "". Missing section → [].
Self-check: every bullet in the source appears exactly once.`;

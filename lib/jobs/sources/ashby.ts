/**
 * Ashby Job Postings API (F22.2, JS-1).
 *
 * Docs: https://developers.ashbyhq.com/docs/public-job-posting-api — a
 * public, unauthenticated endpoint "to display job postings on your own
 * careers page": GET /posting-api/job-board/{name}?includeCompensation=true.
 * Read 2026-10-14. One GET per board, full postings included, cached 30
 * minutes and shared across searches (ats.ts). No published rate limit.
 * Every listing links to the employer's own Ashby posting (`jobUrl`, N18);
 * the results line says "Employer boards via Ashby" (JS-6).
 *
 * `isListed: false` postings are the employer's unlisted roles: skipped,
 * never shown.
 */
import "server-only";
import { searchBoards, type AtsAdapterSpec, type BoardCandidate } from "./ats";
import { workModeOf, type JobQuery, type JobSource, type SourceRun } from "./types";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** The first salary component Ashby states, with its own interval ("1 YEAR" → "year"). */
function salaryOf(comp: unknown): { min: number | null; max: number | null; currency: string | null; period: string | null } {
  const none = { min: null, max: null, currency: null, period: null };
  const parts = (comp as { summaryComponents?: unknown } | null)?.summaryComponents;
  if (!Array.isArray(parts)) return none;
  const salary = parts.find(
    (p): p is Record<string, unknown> => !!p && typeof p === "object" && (p as Record<string, unknown>).compensationType === "Salary",
  );
  if (!salary) return none;
  const interval = str(salary.interval).match(/\b(YEAR|MONTH|WEEK|DAY|HOUR)\b/i);
  return {
    min: typeof salary.minValue === "number" ? Math.round(salary.minValue) : null,
    max: typeof salary.maxValue === "number" ? Math.round(salary.maxValue) : null,
    currency: str(salary.currencyCode) || null,
    period: interval ? interval[1].toLowerCase() : null,
  };
}

const spec: AtsAdapterSpec = {
  ats: "ashby",
  boardUrl: (board) =>
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.token)}?includeCompensation=true`,

  toCandidates(board, body) {
    const jobs = (body as { jobs?: unknown })?.jobs;
    if (!Array.isArray(jobs)) return [];
    return jobs
      .filter((j): j is Record<string, unknown> => !!j && typeof j === "object" && j.isListed !== false)
      .map((j): BoardCandidate => {
        const secondary = Array.isArray(j.secondaryLocations)
          ? j.secondaryLocations.map((l) => str((l as Record<string, unknown>)?.location)).filter(Boolean)
          : [];
        const country = str(
          ((j.address as Record<string, unknown> | undefined)?.postalAddress as Record<string, unknown> | undefined)
            ?.addressCountry,
        );
        const primary = str(j.location);
        // The board's own words, joined: "Bengaluru · Remote", plus the
        // country when the primary location doesn't already say it.
        const location = [primary, ...secondary, country && !primary.includes(country) ? country : ""]
          .filter(Boolean)
          .join(" · ");
        const description = str(j.descriptionPlain);
        const salary = salaryOf(j.compensation);
        return {
          title: str(j.title),
          location,
          workMode: j.isRemote === true ? "remote" : workModeOf(j.workplaceType),
          countryCode: null,
          externalId: str(j.id),
          url: str(j.jobUrl),
          company: board.company,
          description,
          snippet: description.slice(0, 1_200),
          postedAt: str(j.publishedAt) || null,
          salaryMin: salary.min,
          salaryMax: salary.max,
          currency: salary.currency,
          salaryPeriod: salary.period,
          raw: Object.fromEntries(Object.entries(j).filter(([k]) => !k.startsWith("description"))),
        };
      });
  },
};

export const ashby: JobSource = {
  id: "ashby",
  attribution: { label: "Employer boards via Ashby", url: "https://www.ashbyhq.com" },
  configured: () => true,
  search: (keywords: string, query: JobQuery, signal: AbortSignal): Promise<SourceRun> =>
    searchBoards(spec, keywords, query, signal),
};

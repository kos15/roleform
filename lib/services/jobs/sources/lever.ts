/**
 * Lever Postings API (F22.2, JS-1).
 *
 * Docs: https://github.com/lever/postings-api — "The Postings API is a
 * public API… for companies to display job postings on their own careers
 * site"; GET /v0/postings/{site}?mode=json needs no key. Read 2026-10-14.
 * One GET per board, full postings included, cached 30 minutes and shared
 * across searches (ats.ts). No published rate limit (the docs ask
 * integrators to cache, which we do). Every listing links to the employer's
 * own Lever posting (`hostedUrl`, N18); the results line says "Employer
 * boards via Lever" (JS-6).
 *
 * Lever states the country (`country`, ISO) and the workplace type itself;
 * both go to the filter as the board's own facts, never inferred.
 */
import "server-only";
import { searchBoards, type AtsAdapterSpec, type BoardCandidate } from "./ats";
import { workModeOf, type JobQuery, type JobSource, type SourceRun } from "./types";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** "per-year-salary" → "year"; anything unrecognised → null (never guessed). */
function period(interval: unknown): string | null {
  const m = str(interval).match(/per-(year|month|week|day|hour)/);
  return m ? m[1] : null;
}

const spec: AtsAdapterSpec = {
  ats: "lever",
  boardUrl: (board) => `https://api.lever.co/v0/postings/${encodeURIComponent(board.token)}?mode=json`,

  toCandidates(board, body) {
    if (!Array.isArray(body)) return [];
    return body
      .filter((j): j is Record<string, unknown> => !!j && typeof j === "object")
      .map((j): BoardCandidate => {
        const cats = (j.categories ?? {}) as Record<string, unknown>;
        const all = Array.isArray(cats.allLocations) ? cats.allLocations.filter((l): l is string => typeof l === "string") : [];
        const location = all.length > 0 ? all.join(" · ") : str(cats.location);
        const lists = Array.isArray(j.lists)
          ? j.lists
              .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
              .map((l) => `${str(l.text)}\n${str(l.content)}`)
              .join("\n\n")
          : "";
        const description = [str(j.descriptionPlain) || str(j.description), lists, str(j.additionalPlain)]
          .filter(Boolean)
          .join("\n\n");
        const salary = (j.salaryRange ?? null) as Record<string, unknown> | null;
        const created = typeof j.createdAt === "number" ? new Date(j.createdAt).toISOString() : null;
        return {
          title: str(j.text),
          location,
          workMode: workModeOf(j.workplaceType),
          countryCode: str(j.country).toLowerCase() || null,
          externalId: str(j.id),
          url: str(j.hostedUrl),
          company: board.company,
          description,
          snippet: description.slice(0, 1_200),
          postedAt: created,
          salaryMin: typeof salary?.min === "number" ? Math.round(salary.min) : null,
          salaryMax: typeof salary?.max === "number" ? Math.round(salary.max) : null,
          currency: str(salary?.currency) || null,
          salaryPeriod: period(salary?.interval),
          raw: Object.fromEntries(Object.entries(j).filter(([k]) => !/^(description|lists|additional|opening)/.test(k))),
        };
      });
  },
};

export const lever: JobSource = {
  id: "lever",
  attribution: { label: "Employer boards via Lever", url: "https://www.lever.co" },
  configured: () => true,
  search: (keywords: string, query: JobQuery, signal: AbortSignal): Promise<SourceRun> =>
    searchBoards(spec, keywords, query, signal),
};

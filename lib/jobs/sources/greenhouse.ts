/**
 * Greenhouse Job Board API (F22.2, JS-1).
 *
 * Docs: https://developers.greenhouse.io/job-board.html — "the Job Board API
 * is a public API… GET endpoints do not require authentication", published
 * so employers' postings can be shown outside Greenhouse. Read 2026-10-14.
 * We use only the two GET endpoints:
 *   - /v1/boards/{token}/jobs                 the board, WITHOUT content (stripe: 450 KB
 *                                             vs 5.6 MB with it)
 *   - /v1/boards/{token}/jobs/{id}            one posting's content, fetched only for the
 *                                             ≤25 postings that passed the filter
 * No published rate limit; boards are cached 30 minutes and shared across
 * searches (ats.ts). No attribution requirement; every listing links to the
 * employer's own Greenhouse posting (`absolute_url`, N18) and the results
 * line says "Employer boards via Greenhouse" (JS-6).
 *
 * `content` arrives entity-escaped ("&lt;div&gt;"), so it is decoded once
 * here before the shared tidy-up strips the tags.
 */
import "server-only";
import { decodeEntities } from "@/lib/domain/job-text";
import { cachedJson, searchBoards, type AtsAdapterSpec, type BoardCandidate } from "./ats";
import type { Board } from "./ats-boards";
import type { JobQuery, JobSource, SourceRun } from "./types";

const BASE = "https://boards-api.greenhouse.io/v1/boards";
const ENRICH_TIMEOUT_MS = 4_000;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export const spec: AtsAdapterSpec = {
  ats: "greenhouse",
  boardUrl: (board) => `${BASE}/${encodeURIComponent(board.token)}/jobs`,

  toCandidates(board, body) {
    const jobs = (body as { jobs?: unknown })?.jobs;
    if (!Array.isArray(jobs)) return [];
    return jobs
      .filter((j): j is Record<string, unknown> => !!j && typeof j === "object")
      .map((j): BoardCandidate => {
        const location = str((j.location as Record<string, unknown> | undefined)?.name);
        return {
          title: str(j.title),
          location,
          workMode: /\bremote\b/i.test(location) ? "remote" : null,
          countryCode: null,
          externalId: j.id !== undefined ? `${board.token}:${String(j.id)}` : "",
          url: str(j.absolute_url),
          company: board.named
            ? board.company
            : str(j.company_name).replace(/\s+(job board|careers|jobs)$/i, "").trim() || board.company,
          postedAt: str(j.first_published) || str(j.updated_at) || null,
          raw: j,
          // Kept for the enrich step; not a schema field.
          _id: j.id,
        };
      });
  },

  async enrich(board: Board, matches: BoardCandidate[], signal: AbortSignal) {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(ENRICH_TIMEOUT_MS)]);
    return Promise.all(
      matches.map(async (m) => {
        const got = await Promise.race([
          cachedJson(`${BASE}/${encodeURIComponent(board.token)}/jobs/${encodeURIComponent(String(m._id))}`),
          new Promise<"late">((resolve) => deadline.addEventListener("abort", () => resolve("late"), { once: true })),
        ]);
        // A posting whose content didn't arrive in time still ships, as a
        // title-only listing — /analyze then asks for the posting.
        if (got === "late" || "failure" in got) return m;
        const content = decodeEntities(str((got.body as Record<string, unknown>)?.content));
        return { ...m, description: content, snippet: content.slice(0, 1_200) };
      }),
    );
  },
};

export const greenhouse: JobSource = {
  id: "greenhouse",
  attribution: { label: "Employer boards via Greenhouse", url: "https://www.greenhouse.com" },
  configured: () => true,
  search: (keywords: string, query: JobQuery, signal: AbortSignal): Promise<SourceRun> =>
    searchBoards(spec, keywords, query, signal),
};

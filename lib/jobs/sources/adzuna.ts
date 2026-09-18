/**
 * Adzuna Jobs API (F22, JS-1).
 *
 * Docs: https://developer.adzuna.com/overview — the "Search" endpoint.
 * Terms read 2026-09-18: free developer tier, keyed per-app (`app_id` +
 * `app_key`), rate limited by Adzuna's own throttle (not tracked here — a
 * 429 is treated the same as any other non-2xx: this search's results from
 * Adzuna are empty, the other configured sources still run). Attribution
 * required wherever results are shown: "Jobs by Adzuna", linked to
 * adzuna.in. Country fixed to India (`in`) for v1 — `ADZUNA_COUNTRY`
 * overrides for a different deployment.
 *
 * Descriptions returned are snippets, not the full posting (F22 §3.5) — the
 * hand-off into an analysis says so explicitly rather than treating a
 * snippet as something it can honestly score.
 */
import "server-only";
import { parseListings, type JobListingIn, type JobQuery, type JobSource } from "./types";

const BASE = "https://api.adzuna.com/v1/api/jobs";
const RESULTS_PER_PAGE = 25;

function configured(): boolean {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

async function search(query: JobQuery, signal: AbortSignal): Promise<JobListingIn[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return [];

  const country = process.env.ADZUNA_COUNTRY?.trim() || "in";
  const what = query.titles[0] ?? query.skills.slice(0, 3).join(" ");
  if (!what) return [];

  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(RESULTS_PER_PAGE),
    what,
    "content-type": "application/json",
  });
  if (query.location) params.set("where", query.location);

  let response: Response;
  try {
    response = await fetch(`${BASE}/${encodeURIComponent(country)}/search/1?${params.toString()}`, {
      signal,
      headers: { Accept: "application/json" },
    });
  } catch {
    // Timeout (the caller's AbortSignal) or a network failure. Either way
    // this source contributed nothing to this search — degrade, don't throw.
    return [];
  }
  if (!response.ok) return [];

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return [];
  }

  const results = Array.isArray((body as { results?: unknown[] })?.results)
    ? (body as { results: unknown[] }).results
    : [];

  const candidates = results.map(toCandidate).filter((c): c is Record<string, unknown> => c !== null);
  return parseListings(candidates).listings;
}

/** Adzuna's own shape, mapped onto the schema's field names before it is parsed (JS-2). */
function toCandidate(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const company = r.company as Record<string, unknown> | undefined;
  const location = r.location as Record<string, unknown> | undefined;

  return {
    externalId: r.id !== undefined ? String(r.id) : "",
    url: typeof r.redirect_url === "string" ? r.redirect_url : "",
    title: typeof r.title === "string" ? r.title : "",
    company: typeof company?.display_name === "string" ? company.display_name : "",
    location: typeof location?.display_name === "string" ? location.display_name : "",
    snippet: typeof r.description === "string" ? r.description : "",
    postedAt: typeof r.created === "string" ? r.created : null,
    salaryMin: typeof r.salary_min === "number" ? Math.round(r.salary_min) : null,
    salaryMax: typeof r.salary_max === "number" ? Math.round(r.salary_max) : null,
    currency: null,
    raw: r,
  };
}

export const adzuna: JobSource = {
  id: "adzuna",
  attribution: { label: "Jobs by Adzuna", url: "https://www.adzuna.in" },
  configured,
  search,
};

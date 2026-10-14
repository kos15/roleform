/**
 * Adzuna Jobs API (F22, JS-1).
 *
 * Docs: https://developer.adzuna.com/overview — the "Search" endpoint.
 * Terms read 2026-09-18: free developer tier, keyed per-app (`app_id` +
 * `app_key`), rate limited by Adzuna's own throttle (not tracked here — a
 * 429 is retried once inside the 8s budget, then reported as this source
 * failing; the other configured sources still run). Attribution required
 * wherever results are shown: "Jobs by Adzuna", linked to adzuna.in.
 * Country fixed to India (`in`) for v1 — `ADZUNA_COUNTRY` overrides for a
 * different deployment.
 *
 * F22.1: `max_days_old` is Adzuna's own documented recency filter, so the
 * window goes to the provider instead of only being enforced on our side.
 *
 * Descriptions returned are snippets, not the full posting (F22 §3.5) — the
 * hand-off into an analysis says so explicitly rather than treating a
 * snippet as something it can honestly score.
 */
import "server-only";
import { emptyRun, fetchJson, parseListings, type JobQuery, type JobSource, type SourceRun } from "./types";

const BASE = "https://api.adzuna.com/v1/api/jobs";
const RESULTS_PER_PAGE = 25;

function configured(): boolean {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

async function search(keywords: string, query: JobQuery, signal: AbortSignal): Promise<SourceRun> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey || !keywords) return emptyRun();

  const country = process.env.ADZUNA_COUNTRY?.trim() || "in";
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(RESULTS_PER_PAGE),
    what: keywords,
    "content-type": "application/json",
  });
  // Adzuna's `where` is a place name; the country is already the path.
  const city = query.location.split(",")[0]?.trim();
  if (city) params.set("where", city);
  if (query.postedWithinDays > 0) params.set("max_days_old", String(query.postedWithinDays));

  const res = await fetchJson(`${BASE}/${encodeURIComponent(country)}/search/1?${params.toString()}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if ("failure" in res) return emptyRun(res.failure);

  const results = (res.body as { results?: unknown })?.results;
  if (!Array.isArray(results)) return emptyRun({ kind: "body" });

  const candidates = results.map(toCandidate).filter((c): c is Record<string, unknown> => c !== null);
  const { listings, dropped } = parseListings(candidates);
  return { listings, dropped: dropped + (results.length - candidates.length), closed: 0, failure: null };
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
    // Adzuna's salary fields are annual figures (developer docs, "salary_min").
    salaryPeriod: typeof r.salary_min === "number" || typeof r.salary_max === "number" ? "year" : null,
    raw: r,
  };
}

export const adzuna: JobSource = {
  id: "adzuna",
  attribution: { label: "Jobs by Adzuna", url: "https://www.adzuna.in" },
  configured,
  search,
};

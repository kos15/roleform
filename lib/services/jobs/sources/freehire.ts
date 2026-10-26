/**
 * freehire.me public API (F22.1, JS-1; reference R3/R4).
 *
 * Docs: https://freehire.me — "API docs"; the agent search endpoint,
 * `GET /api/v1/agent/jobs/search`, which returns each hit's FULL posting
 * text rather than a preview, so one request per keyword variant is the
 * whole cost. Open-source aggregator (backend MIT, github.com/strelov1/
 * freehire) normalising postings from ~50 ATS platforms.
 *
 * Terms read 2026-10-14 (freehire.me/terms, last updated 2026-08-10): reads
 * are public and unauthenticated; "no scraping beyond our documented API, no
 * attempting to bypass rate limits"; listings are aggregated from third
 * parties and may be closed. We use only the documented endpoint, one call
 * per variant, retried once on 429/5xx inside the 8s budget, never in a
 * loop. No published rate limit; the 12h query cache and the per-member cap
 * keep volume low. No attribution is required; we show "Jobs via freehire"
 * like every other source (JS-6). Best-effort service, no SLA — an outage is
 * reported as this source failing, never as an empty result.
 *
 * Location is a facet here, not free text (R4): we send the profile's
 * country code, never the city (an unresolved city facet would silently
 * drop listings). Remote sends `work_mode=remote` and no country.
 *
 * `url` is the provider's own field — it points at the original ATS posting
 * and carries freehire's own `utm_source`; we keep it exactly as sent (N18).
 *
 * `FREEHIRE_API_URL` points at a self-hosted instance; `JOBS_DISABLED_SOURCES`
 * turns this source off (R2).
 */
import "server-only";
import { emptyRun, fetchJson, parseListings, workModeOf, type JobQuery, type JobSource, type SourceRun } from "./types";

const DEFAULT_BASE = "https://freehire.me";
const SEARCH_PATH = "/api/v1/agent/jobs/search";
const RESULTS_LIMIT = 25;

function base(): string {
  return (process.env.FREEHIRE_API_URL?.trim() || DEFAULT_BASE).replace(/\/+$/, "");
}

/** Keyless — always configured unless switched off by `JOBS_DISABLED_SOURCES`. */
function configured(): boolean {
  return true;
}

/** "Pune, IN" → "in". Only a two-letter code is trusted as a facet value. */
function countryCode(location: string): string | null {
  const last = location.split(",").pop()?.trim() ?? "";
  return /^[A-Za-z]{2}$/.test(last) ? last.toLowerCase() : null;
}

async function search(keywords: string, query: JobQuery, signal: AbortSignal): Promise<SourceRun> {
  if (!keywords) return emptyRun();

  const params = new URLSearchParams({
    q: keywords,
    limit: String(RESULTS_LIMIT),
    offset: "0",
    description_format: "text",
  });
  if (query.postedWithinDays > 0) params.set("posted_within_days", String(query.postedWithinDays));
  if (query.remote) params.set("work_mode", "remote");
  else {
    const cc = countryCode(query.location);
    if (cc) params.append("countries", cc);
  }

  const res = await fetchJson(`${base()}${SEARCH_PATH}?${params.toString()}`, {
    signal,
    headers: { Accept: "application/json", "User-Agent": "roleform/1.0 (+https://roleform.koustubh.org)" },
  });
  if ("failure" in res) return emptyRun(res.failure);

  const data = (res.body as { data?: unknown })?.data;
  if (!Array.isArray(data)) return emptyRun({ kind: "body" });

  // R17: the provider's own closed marker — dropped and counted, not shown.
  const open = data.filter((r) => !(r && typeof r === "object" && (r as Record<string, unknown>).closed_at));
  const closed = data.length - open.length;

  const candidates = open.map(toCandidate).filter((c): c is Record<string, unknown> => c !== null);
  const { listings, dropped } = parseListings(candidates);
  return { listings, dropped: dropped + (open.length - candidates.length), closed, failure: null };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
}

/** freehire's own shape, mapped onto the schema's field names before it is parsed (JS-2). */
function toCandidate(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const e = (r.enrichment && typeof r.enrichment === "object" ? r.enrichment : {}) as Record<string, unknown>;
  const reality = (r.reality && typeof r.reality === "object" ? r.reality : {}) as Record<string, unknown>;
  const description = typeof r.description === "string" ? r.description : "";

  return {
    externalId: typeof r.public_slug === "string" ? r.public_slug : "",
    url: typeof r.url === "string" ? r.url : "",
    title: typeof r.title === "string" ? r.title : "",
    company: typeof r.company === "string" ? r.company : "",
    location: typeof r.location === "string" ? r.location : "",
    snippet: description.slice(0, 600),
    description,
    postedAt: typeof r.posted_at === "string" ? r.posted_at : null,
    salaryMin: num(e.salary_min),
    salaryMax: num(e.salary_max),
    currency: typeof e.salary_currency === "string" ? e.salary_currency : null,
    salaryPeriod: typeof e.salary_period === "string" ? e.salary_period : null,
    skills: Array.isArray(r.skills) ? r.skills.filter((s): s is string => typeof s === "string").slice(0, 60) : [],
    workMode: workModeOf(r.work_mode),
    minYears: num(e.experience_years_min),
    repostCount: num(reality.repost_count),
    massPostingCount: num(reality.mass_posting_count),
    // The body is already in `description`; not stored twice.
    raw: Object.fromEntries(Object.entries(r).filter(([k]) => k !== "description")),
  };
}

export const freehire: JobSource = {
  id: "freehire",
  attribution: { label: "Jobs via freehire", url: "https://freehire.me" },
  configured,
  search,
};

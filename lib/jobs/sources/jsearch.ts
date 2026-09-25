/**
 * JSearch API via RapidAPI (F22 addendum — docs/prd-jsearch.md).
 *
 * Docs: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch — `GET /search`
 * on `jsearch.p.rapidapi.com`, keyed by `X-RapidAPI-Key`. Terms read
 * 2026-09-25: JSearch serves Google for Jobs results (LinkedIn, Indeed,
 * Glassdoor, Naukri, company career pages…) through a documented, keyed API;
 * the provider does the collecting, so this adapter is a plain API call like
 * Adzuna's (N17 unchanged). Free tier is 200 requests/month on RapidAPI's
 * Basic plan; a non-2xx (429 included) means this source contributed nothing
 * to this search, never a thrown error. One page per search (10 results) is
 * one request — `JSEARCH_PAGES` raises it at the cost of more quota.
 *
 * Unlike Adzuna and Jooble, JSearch returns the full description, so the
 * snippet here is a trimmed head of the real posting and ranking sees more
 * of it. The apply link is the provider's own `job_apply_link` (N18) — never
 * assembled, and a record without one is dropped at the schema.
 */
import "server-only";
import { primaryTerms } from "@/lib/domain/job-query";
import { parseListings, type JobListingIn, type JobQuery, type JobSource } from "./types";

const HOST = "jsearch.p.rapidapi.com";
const SNIPPET_CHARS = 1_200;

function configured(): boolean {
  return Boolean(process.env.JSEARCH_API_KEY);
}

/**
 * JSearch reads location best inside the query text ("react developer in
 * pune"), and country as its own parameter. Only JobQuery fields go in (N19).
 */
export function jsearchQueryText(query: JobQuery): string {
  const title = query.titles[0]?.trim();
  const extras = title
    ? query.keywords.filter((k) => !title.toLowerCase().includes(k.toLowerCase())).slice(0, 2)
    : [];
  const terms = [primaryTerms(query), ...extras].join(" ").trim();
  if (!terms) return "";
  const city = query.location.split(",")[0]?.trim();
  return city && !query.remote ? `${terms} in ${city}` : terms;
}

async function search(query: JobQuery, signal: AbortSignal): Promise<JobListingIn[]> {
  const key = process.env.JSEARCH_API_KEY;
  if (!key) return [];

  const text = jsearchQueryText(query);
  if (!text) return [];

  const params = new URLSearchParams({
    query: text,
    page: "1",
    num_pages: String(Math.min(Math.max(Number(process.env.JSEARCH_PAGES) || 1, 1), 3)),
    country: process.env.JSEARCH_COUNTRY?.trim() || "in",
    // Postings older than a month are the likeliest to be filled or dead.
    date_posted: "month",
  });
  if (query.remote) params.set("work_from_home", "true");

  let response: Response;
  try {
    response = await fetch(`https://${HOST}/search?${params.toString()}`, {
      signal,
      headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST, Accept: "application/json" },
    });
  } catch {
    return [];
  }
  if (!response.ok) return [];

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return [];
  }

  const jobs = Array.isArray((body as { data?: unknown[] })?.data) ? (body as { data: unknown[] }).data : [];
  const candidates = jobs.map(toCandidate).filter((c): c is Record<string, unknown> => c !== null);
  return parseListings(candidates).listings;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

/** JSearch's own shape, mapped onto the schema's field names before it is parsed (JS-2). */
function toCandidate(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const location =
    [str(r.job_city), str(r.job_state), str(r.job_country)].filter(Boolean).join(", ") || str(r.job_location);
  const description = str(r.job_description).replace(/\s+/g, " ");

  return {
    externalId: str(r.job_id),
    url: str(r.job_apply_link),
    title: str(r.job_title),
    company: str(r.employer_name),
    location: r.job_is_remote === true && !/remote/i.test(location) ? [location, "Remote"].filter(Boolean).join(" · ") : location,
    snippet: description.length > SNIPPET_CHARS ? `${description.slice(0, SNIPPET_CHARS)}…` : description,
    postedAt: str(r.job_posted_at_datetime_utc) || null,
    salaryMin: int(r.job_min_salary),
    salaryMax: int(r.job_max_salary),
    currency: str(r.job_salary_currency) || null,
    raw: r,
  };
}

export const jsearch: JobSource = {
  id: "jsearch",
  attribution: { label: "Jobs via JSearch (Google for Jobs)", url: "https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch" },
  configured,
  search,
};

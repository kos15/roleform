/**
 * Jooble API (F22, JS-1).
 *
 * Docs: https://jooble.org/api/about — a free per-key POST endpoint,
 * `https://jooble.org/api/{key}`, body `{ keywords, location }`. Terms read
 * 2026-09-18: free tier, one key per registered application, no published
 * hard rate limit at registration time — treated the same as Adzuna's
 * throttle regardless: a non-2xx or a timeout means this source contributed
 * nothing to this search, never a thrown error. No attribution requirement
 * is published in the developer terms, but every source gets one anyway
 * (JS-6) for the same reason Adzuna's is shown — consistency beats reading
 * the fine print differently per provider.
 */
import "server-only";
import { parseListings, type JobListingIn, type JobQuery, type JobSource } from "./types";

const RESULTS_LIMIT = 25;

function configured(): boolean {
  return Boolean(process.env.JOOBLE_API_KEY);
}

async function search(query: JobQuery, signal: AbortSignal): Promise<JobListingIn[]> {
  const key = process.env.JOOBLE_API_KEY;
  if (!key) return [];

  const keywords = query.titles[0] ?? query.skills.slice(0, 3).join(" ");
  if (!keywords) return [];

  let response: Response;
  try {
    response = await fetch(`https://jooble.org/api/${encodeURIComponent(key)}`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        keywords,
        location: query.location || undefined,
      }),
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

  const jobs = Array.isArray((body as { jobs?: unknown[] })?.jobs)
    ? (body as { jobs: unknown[] }).jobs.slice(0, RESULTS_LIMIT)
    : [];

  const candidates = jobs.map(toCandidate).filter((c): c is Record<string, unknown> => c !== null);
  return parseListings(candidates).listings;
}

/** Jooble's own shape, mapped onto the schema's field names before it is parsed (JS-2). */
function toCandidate(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  return {
    externalId: r.id !== undefined ? String(r.id) : (typeof r.link === "string" ? r.link : ""),
    url: typeof r.link === "string" ? r.link : "",
    title: typeof r.title === "string" ? r.title : "",
    company: typeof r.company === "string" ? r.company : "",
    location: typeof r.location === "string" ? r.location : "",
    snippet: typeof r.snippet === "string" ? r.snippet : "",
    postedAt: typeof r.updated === "string" ? r.updated : null,
    salaryMin: null,
    salaryMax: null,
    currency: null,
    raw: r,
  };
}

export const jooble: JobSource = {
  id: "jooble",
  attribution: { label: "Powered by Jooble", url: "https://jooble.org" },
  configured,
  search,
};

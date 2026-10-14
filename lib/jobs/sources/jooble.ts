/**
 * Jooble API (F22, JS-1).
 *
 * Docs: https://jooble.org/api/about — a free per-key POST endpoint,
 * `https://jooble.org/api/{key}`, body `{ keywords, location }`. Terms read
 * 2026-09-18: free tier, one key per registered application, no published
 * hard rate limit at registration time — treated the same as Adzuna's
 * throttle regardless: a non-2xx or a timeout is reported as this source
 * failing, never a thrown error. No attribution requirement is published in
 * the developer terms, but every source gets one anyway (JS-6) for the same
 * reason Adzuna's is shown — consistency beats reading the fine print
 * differently per provider.
 *
 * Jooble has no recency filter we rely on; the window is enforced on our
 * side for it (F22.1, R11 — a sort is not a filter).
 */
import "server-only";
import { emptyRun, fetchJson, parseListings, type JobQuery, type JobSource, type SourceRun } from "./types";

const RESULTS_LIMIT = 25;

function configured(): boolean {
  return Boolean(process.env.JOOBLE_API_KEY);
}

async function search(keywords: string, query: JobQuery, signal: AbortSignal): Promise<SourceRun> {
  const key = process.env.JOOBLE_API_KEY;
  if (!key || !keywords) return emptyRun();

  const res = await fetchJson(`https://jooble.org/api/${encodeURIComponent(key)}`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      keywords: query.remote ? `${keywords} remote` : keywords,
      location: query.location || undefined,
    }),
  });
  if ("failure" in res) return emptyRun(res.failure);

  const all = (res.body as { jobs?: unknown })?.jobs;
  if (!Array.isArray(all)) return emptyRun({ kind: "body" });
  const jobs = all.slice(0, RESULTS_LIMIT);

  const candidates = jobs.map(toCandidate).filter((c): c is Record<string, unknown> => c !== null);
  const { listings, dropped } = parseListings(candidates);
  return { listings, dropped: dropped + (jobs.length - candidates.length), closed: 0, failure: null };
}

/** Jooble's own shape, mapped onto the schema's field names before it is parsed (JS-2). */
function toCandidate(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = typeof r.type === "string" ? r.type : "";

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
    // Jooble's `type` is employment type ("Full-time"); a remote flag only
    // when it says so in so many words.
    workMode: /remote/i.test(type) ? "remote" : null,
    raw: r,
  };
}

export const jooble: JobSource = {
  id: "jooble",
  attribution: { label: "Powered by Jooble", url: "https://jooble.org" },
  configured,
  search,
};

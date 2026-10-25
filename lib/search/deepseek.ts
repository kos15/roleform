/**
 * DeepSeek Search API — a web search client for CURATION scripts only.
 *
 * Docs: https://api-docs.deepseek.com/guides/search (read 2026-10-25).
 * `POST https://api.deepseek.com/v1/tools/search`, bearer auth with the
 * ordinary DeepSeek API key. $0.75 per 1,000 successful searches (empty
 * results and failures are not billed), 100 QPS per account. Terms: DeepSeek
 * Open Platform Terms of Service (released 2026-04-22), governed by PRC law —
 * which is one more reason nothing but role titles, skill names and a country
 * is ever sent (N7/N19).
 *
 * ── Where this may be used ──────────────────────────────────────────────────
 * Only by admin scripts that PROPOSE rows for a person to curate:
 *   - `pnpm jobs:discover-boards` — finds employer boards for F22.2; every
 *     candidate is then verified against the vendor's own documented API.
 *   - `pnpm catalog:discover`     — finds course candidates for `corpus_gaps`;
 *     a person writes the `CourseDef`, `pnpm seed:catalog` checks the link.
 *
 * Never on a request path. A search result is not a job listing (N17 — the
 * web-search fallback stays refused, docs/job-search-architecture.md R6), not
 * a course (N8 — the catalog is curated), and not a source for a generated
 * interview question (N2). The Fetch API is not wrapped at all: fetching an
 * employer's page through a third party is still fetching it (N17).
 *
 * Neither `localization` (an IP) nor `ori_question` is ever sent. Every
 * response crosses the boundary through `SearchResponseSchema` (N18); a bad
 * record is dropped and counted, never coerced.
 */
import "server-only";
import { z } from "zod";

const ENDPOINT = "https://api.deepseek.com/v1/tools/search";
const TIMEOUT_MS = 15_000;
/** The API's own limit on `query`, in Unicode characters. */
export const MAX_QUERY_CHARS = 128;

const SearchHitSchema = z.object({
  rerank_score: z.number(),
  title: z.string(),
  url: z.url(),
  snippet: z.string(),
  site_name: z.string().nullable(),
  date: z.string().nullable(),
  authority: z.number().int().min(-1).max(4),
});

const SearchResponseSchema = z.object({ results: z.array(z.unknown()) });

export type SearchHit = z.infer<typeof SearchHitSchema>;

export type SearchFailure =
  | { kind: "not_configured" }
  | { kind: "query_too_long" }
  | { kind: "timeout" | "network" | "body" }
  | { kind: "http"; status: number };

export type SearchOutcome = { ok: true; hits: SearchHit[]; dropped: number } | { ok: false; error: SearchFailure };

export function deepseekConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
}

/** One search. Never throws; one retry on 429/5xx, as the docs ask. */
export async function webSearch(query: string, count = 10): Promise<SearchOutcome> {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) return { ok: false, error: { kind: "not_configured" } };
  if ([...query].length > MAX_QUERY_CHARS) return { ok: false, error: { kind: "query_too_long" } };

  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, count: Math.min(Math.max(count, 1), 50), need_content: false }),
      });
    } catch (e) {
      return { ok: false, error: { kind: e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network" } };
    }
    if ((response.status === 429 || response.status >= 500) && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1_000));
      continue;
    }
    if (!response.ok) return { ok: false, error: { kind: "http", status: response.status } };

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, error: { kind: "body" } };
    }
    const parsed = SearchResponseSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: { kind: "body" } };

    const hits: SearchHit[] = [];
    let dropped = 0;
    for (const raw of parsed.data.results) {
      const hit = SearchHitSchema.safeParse(raw);
      if (hit.success) hits.push(hit.data);
      else dropped++;
    }
    return { ok: true, hits, dropped };
  }
  return { ok: false, error: { kind: "http", status: 429 } };
}

/** For script output: what went wrong, in words, with no query text in it (N7). */
export function describeFailure(error: SearchFailure): string {
  switch (error.kind) {
    case "not_configured":
      return "DEEPSEEK_API_KEY is not set";
    case "query_too_long":
      return `query over ${MAX_QUERY_CHARS} characters`;
    case "http":
      return error.status === 401
        ? "HTTP 401 — the key is missing or invalid"
        : error.status === 402
          ? "HTTP 402 — the DeepSeek account has no balance"
          : `HTTP ${error.status}`;
    default:
      return error.kind;
  }
}

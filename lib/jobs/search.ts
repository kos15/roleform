import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { adzuna } from "./sources/adzuna";
import { jooble } from "./sources/jooble";
import { jsearch } from "./sources/jsearch";
import type { JobListingIn, JobQuery, JobSource } from "./sources/types";
import { rankListings, type RankableListing } from "@/lib/domain/job-rank";
import type { JobProvider } from "@/lib/generated/prisma/enums";

/**
 * The job search fan-out (F22, JS-2/JS-7).
 *
 * One call per configured source, 8s timeout each, the results merged and
 * capped at 50 listings total, cached for 12h so a repeat of the same query
 * costs neither an API call nor a cap unit (JS-4). Nothing here scrapes —
 * every source is one of the adapters below, each behind a documented API
 * (N17).
 *
 * Order matters twice: results are interleaved source by source before the
 * cap, and when two sources carry the same job the earlier one's copy is
 * kept. JSearch goes first — it has the full description and the employer's
 * own apply link (docs/prd-jsearch.md).
 */
const SOURCES: JobSource[] = [jsearch, adzuna, jooble];
const SOURCE_TIMEOUT_MS = 8_000;
const MAX_LISTINGS = 50;
const CACHE_WINDOW_MS = 12 * 60 * 60 * 1000;
const LISTING_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function queryHash(query: JobQuery): string {
  const normalised = JSON.stringify({
    titles: [...query.titles].map((t) => t.toLowerCase().trim()).sort(),
    skills: [...query.skills].map((s) => s.toLowerCase().trim()).sort(),
    keywords: [...query.keywords].map((s) => s.toLowerCase().trim()).sort(),
    location: query.location.toLowerCase().trim(),
    remote: query.remote,
  });
  return createHash("sha256").update(normalised).digest("hex");
}

export interface SearchListingView {
  id: string;
  source: JobProvider;
  title: string;
  company: string;
  location: string;
  snippet: string;
  url: string;
  postedAt: Date | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  matchedSkills: string[];
}

export interface SearchOutcome {
  searchId: string | null;
  listings: SearchListingView[];
  sourcesQueried: Array<{ id: string; label: string; url: string; configured: boolean }>;
  fromCache: boolean;
  /** What was actually sent — shown back so a described search can be checked. */
  searched: Pick<JobQuery, "titles" | "keywords" | "location" | "remote">;
}

/**
 * A repeat of the same normalised query within the cache window reads the
 * existing hits back and creates no new `job_searches` row — JS-4, and the
 * reason `searchJobs` (app/actions/jobs.ts) can check the cap AFTER calling
 * this only on the non-cached path.
 */
export async function findCachedSearch(
  clerkUserId: string,
  query: JobQuery,
): Promise<SearchOutcome | null> {
  const hash = queryHash(query);
  const since = new Date(Date.now() - CACHE_WINDOW_MS);

  const cached = await db.jobSearch.findFirst({
    where: { clerkUserId, queryHash: hash, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: {
      hits: {
        orderBy: { rank: "asc" },
        select: { listing: true },
      },
    },
  });
  if (!cached) return null;

  return {
    searchId: null,
    listings: cached.hits
      .filter((h) => h.listing.expiresAt > new Date())
      .map((h) => toView(h.listing, [])),
    sourcesQueried: SOURCES.map((s) => ({
      id: s.id,
      label: s.attribution.label,
      url: s.attribution.url,
      configured: s.configured(),
    })),
    fromCache: true,
    searched: searchedOf(query),
  };
}

export async function runSearch(clerkUserId: string, query: JobQuery): Promise<SearchOutcome> {
  const configuredSources = SOURCES.filter((s) => s.configured());

  const perSource = await Promise.allSettled(
    configuredSources.map(async (source) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
      try {
        const listings = await source.search(query, controller.signal);
        return { source: source.id, listings };
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  const bySource: Array<Array<{ source: JobProvider; listing: JobListingIn }>> = [];
  for (const result of perSource) {
    if (result.status !== "fulfilled") continue;
    bySource.push(
      result.value.listings.map((listing) => ({ source: result.value.source as JobProvider, listing })),
    );
  }

  // Round-robin across sources so the cap can't be filled by whichever one
  // happens to return the most rows.
  const bySourceListings = interleave(bySource);

  // Dedupe by (source, externalId) — a provider can legitimately repeat a
  // listing across pages — and across sources by title + company, since
  // JSearch and the boards behind Adzuna/Jooble often carry the same job.
  const seen = new Set<string>();
  const deduped = bySourceListings.filter(({ source, listing }) => {
    const keys = [`${source}:${listing.externalId}`, sameJobKey(listing)].filter(
      (k): k is string => k !== null,
    );
    if (keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });

  const capped = deduped.slice(0, MAX_LISTINGS);

  // Upsert each listing into the shared cache (JS-9: no user id on this table).
  const expiresAt = new Date(Date.now() + LISTING_TTL_MS);
  const listingRows = await Promise.all(
    capped.map(({ source, listing }) =>
      db.jobListing.upsert({
        where: { source_externalId: { source, externalId: listing.externalId } },
        create: {
          source,
          externalId: listing.externalId,
          url: listing.url,
          title: listing.title,
          company: listing.company,
          location: listing.location,
          snippet: listing.snippet,
          postedAt: listing.postedAt ? new Date(listing.postedAt) : null,
          salaryMin: listing.salaryMin,
          salaryMax: listing.salaryMax,
          currency: listing.currency,
          raw: listing.raw as object,
          expiresAt,
        },
        // A repeat listing refreshes its cache window and content — a stale
        // salary or a since-edited title should not persist for 30 days
        // past when we last actually saw it.
        update: {
          url: listing.url,
          title: listing.title,
          company: listing.company,
          location: listing.location,
          snippet: listing.snippet,
          postedAt: listing.postedAt ? new Date(listing.postedAt) : null,
          salaryMin: listing.salaryMin,
          salaryMax: listing.salaryMax,
          currency: listing.currency,
          raw: listing.raw as object,
          expiresAt,
        },
      }),
    ),
  );

  const profileSkillsHint = query.skills;
  const rankable: RankableListing[] = listingRows.map((row, i) => ({
    id: row.id,
    title: row.title,
    snippet: row.snippet,
    postedAt: row.postedAt,
    sourceOrder: i,
  }));
  const ranked = rankListings(rankable, profileSkillsHint);
  const rankById = new Map(ranked.map((r, i) => [r.id, { rank: i, matchedSkills: r.matchedSkills }]));

  const orderedRows = [...listingRows].sort(
    (a, b) => (rankById.get(a.id)?.rank ?? 0) - (rankById.get(b.id)?.rank ?? 0),
  );

  const search = await db.jobSearch.create({
    data: {
      clerkUserId,
      queryHash: queryHash(query),
      titles: query.titles,
      location: query.location,
      remote: query.remote,
      resultCount: orderedRows.length,
      sources: configuredSources.map((s) => s.id),
      hits: {
        create: orderedRows.map((row, i) => ({ listingId: row.id, rank: i })),
      },
    },
    select: { id: true },
  });

  return {
    searchId: search.id,
    listings: orderedRows.map((row) => toView(row, rankById.get(row.id)?.matchedSkills ?? [])),
    sourcesQueried: SOURCES.map((s) => ({
      id: s.id,
      label: s.attribution.label,
      url: s.attribution.url,
      configured: s.configured(),
    })),
    fromCache: false,
    searched: searchedOf(query),
  };
}

function searchedOf(query: JobQuery): SearchOutcome["searched"] {
  return { titles: query.titles, keywords: query.keywords, location: query.location, remote: query.remote };
}

function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) if (i < list.length) out.push(list[i]);
  }
  return out;
}

/** Title + company, normalised. Null without a company — too weak to call two listings the same job. */
function sameJobKey(listing: JobListingIn): string | null {
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const company = norm(listing.company);
  if (!company) return null;
  return `job:${norm(listing.title)}|${company}`;
}

function toView(
  row: {
    id: string;
    source: JobProvider;
    title: string;
    company: string;
    location: string;
    snippet: string;
    url: string;
    postedAt: Date | null;
    salaryMin: number | null;
    salaryMax: number | null;
    currency: string | null;
  },
  matchedSkills: string[],
): SearchListingView {
  return {
    id: row.id,
    source: row.source,
    title: row.title,
    company: row.company,
    location: row.location,
    snippet: row.snippet,
    url: row.url,
    postedAt: row.postedAt,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    currency: row.currency,
    matchedSkills,
  };
}

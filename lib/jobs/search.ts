import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { adzuna } from "./sources/adzuna";
import { jooble } from "./sources/jooble";
import type { JobListingIn, JobQuery, JobSource } from "./sources/types";
import { rankListings, type RankableListing } from "@/lib/domain/job-rank";
import type { JobProvider } from "@/lib/generated/prisma/enums";

/**
 * The job search fan-out (F22, JS-2/JS-7).
 *
 * One call per configured source, 8s timeout each, the results merged and
 * capped at 50 listings total, cached for 12h so a repeat of the same query
 * costs neither an API call nor a cap unit (JS-4). Nothing here scrapes —
 * every source is one of the two adapters below, each behind a documented
 * API (N17).
 */
const SOURCES: JobSource[] = [adzuna, jooble];
const SOURCE_TIMEOUT_MS = 8_000;
const MAX_LISTINGS = 50;
const CACHE_WINDOW_MS = 12 * 60 * 60 * 1000;
const LISTING_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function queryHash(query: JobQuery): string {
  const normalised = JSON.stringify({
    titles: [...query.titles].map((t) => t.toLowerCase().trim()).sort(),
    skills: [...query.skills].map((s) => s.toLowerCase().trim()).sort(),
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

  const bySourceListings: Array<{ source: JobProvider; listing: JobListingIn }> = [];
  for (const result of perSource) {
    if (result.status !== "fulfilled") continue;
    for (const listing of result.value.listings) {
      bySourceListings.push({ source: result.value.source as JobProvider, listing });
    }
  }

  // Dedupe by (source, externalId) — a provider can legitimately repeat a
  // listing across pages within one response in rare cases.
  const seen = new Set<string>();
  const deduped = bySourceListings.filter(({ source, listing }) => {
    const key = `${source}:${listing.externalId}`;
    if (seen.has(key)) return false;
    seen.add(key);
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
  };
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

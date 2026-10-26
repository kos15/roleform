import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { freehire } from "./sources/freehire";
import { greenhouse } from "./sources/greenhouse";
import { lever } from "./sources/lever";
import { ashby } from "./sources/ashby";
import type { JobListingIn, JobQuery, JobSource, SourceRun } from "./sources/types";
import { planKeywords } from "@/lib/domain/job-query";
import { jobKey } from "@/lib/domain/job-key";
import { hasResidue } from "@/lib/domain/job-text";
import { assessHealth, type SourceReport } from "@/lib/domain/job-health";
import type { JobProvider } from "@/lib/generated/prisma/enums";

/**
 * The job search fan-out (F22, JS-2/JS-7; F22.1, R5/R9/R11/R14/R28).
 *
 * Up to three keyword variants (`planKeywords`) against every configured
 * source, in parallel, 8s per source for all of its variants together. Each
 * adapter returns what it did — listings, drops, a failure — and that becomes
 * this search's source report. Listings outside the recency window are
 * dropped here for every source (a provider's own filter is a courtesy, not
 * a guarantee), exact duplicates across sources collapse, and at most 50
 * listings are kept, interleaved across sources so one board can't crowd
 * out the rest. The result is cached for 12h so a repeat of the same query
 * costs neither an API call nor a cap unit (JS-4). Nothing here scrapes —
 * every source is an adapter behind a documented API (N17) — and nothing
 * here calls a model (N13).
 */
export const SOURCES: JobSource[] = [freehire, greenhouse, lever, ashby];
const SOURCE_TIMEOUT_MS = 8_000;
const MAX_LISTINGS = 50;
const CACHE_WINDOW_MS = 12 * 60 * 60 * 1000;
const LISTING_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** `JOBS_DISABLED_SOURCES=lever,freehire` keeps a source installed but skipped (R2). */
function disabledSources(): Set<string> {
  return new Set(
    (process.env.JOBS_DISABLED_SOURCES ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function sourceLabel(id: string): { label: string; url: string } {
  const source = SOURCES.find((s) => s.id === id);
  return source ? source.attribution : { label: id, url: "" };
}

export function queryHash(query: JobQuery): string {
  const normalised = JSON.stringify({
    titles: [...query.titles].map((t) => t.toLowerCase().trim()).sort(),
    skills: [...query.skills].map((s) => s.toLowerCase().trim()).sort(),
    location: query.location.toLowerCase().trim(),
    remote: query.remote,
    postedWithinDays: query.postedWithinDays,
    // A change in which sources run is a different search, not a cache hit.
    sources: SOURCES.filter((s) => s.configured() && !disabledSources().has(s.id))
      .map((s) => s.id)
      .sort(),
  });
  return createHash("sha256").update(normalised).digest("hex");
}

/**
 * A repeat of the same normalised query within the cache window returns the
 * existing search's id and creates no new `job_searches` row — JS-4, and the
 * reason `searchJobs` (app/actions/jobs.ts) can check the cap after this,
 * only on the non-cached path.
 */
export async function findCachedSearchId(clerkUserId: string, query: JobQuery): Promise<string | null> {
  const cached = await db.jobSearch.findFirst({
    where: {
      clerkUserId,
      queryHash: queryHash(query),
      createdAt: { gte: new Date(Date.now() - CACHE_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return cached?.id ?? null;
}

interface Collected {
  source: JobSource;
  run: SourceRun;
}

async function runSource(source: JobSource, variants: string[], query: JobQuery): Promise<Collected> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  try {
    const runs = await Promise.all(variants.map((v) => source.search(v, query, controller.signal)));
    // Variants of one search hit the same board: the same listing can come
    // back twice, under the provider's own id.
    const seen = new Set<string>();
    const listings: JobListingIn[] = [];
    for (const run of runs) {
      for (const listing of run.listings) {
        if (seen.has(listing.externalId)) continue;
        seen.add(listing.externalId);
        listings.push(listing);
      }
    }
    // The source failed only if every variant failed; one bad variant beside
    // good ones is a partial result, which the counts already show.
    const failure = runs.every((r) => r.failure) ? runs[0]?.failure ?? null : null;
    return {
      source,
      run: {
        listings,
        dropped: runs.reduce((n, r) => n + r.dropped, 0),
        closed: runs.reduce((n, r) => n + r.closed, 0),
        failure,
        boards: runs.some((r) => r.boards)
          ? {
              // Boards are shared across variants (one cached fetch), so the
              // worst variant's count is the honest one, not the sum.
              failed: Math.max(...runs.map((r) => r.boards?.failed ?? 0)),
              total: Math.max(...runs.map((r) => r.boards?.total ?? 0)),
            }
          : undefined,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

function inWindow(postedAt: string | null, days: number, now: number): boolean {
  if (days <= 0 || !postedAt) return true; // undated listings are kept and marked (R11)
  const t = Date.parse(postedAt);
  if (!Number.isFinite(t)) return true;
  return now - t <= days * DAY_MS;
}

export async function runSearch(clerkUserId: string, query: JobQuery): Promise<{ searchId: string }> {
  const disabled = disabledSources();
  const variants = planKeywords(query);
  const active = SOURCES.filter((s) => s.configured() && !disabled.has(s.id));
  const collected = variants.length > 0 ? await Promise.all(active.map((s) => runSource(s, variants, query))) : [];
  const now = Date.now();

  const reports: SourceReport[] = [];
  const perSource: Array<Array<{ source: JobProvider; listing: JobListingIn }>> = [];

  for (const source of SOURCES) {
    if (disabled.has(source.id)) {
      reports.push({ id: source.id, state: "disabled", listings: 0, dropped: 0, closed: 0, outOfWindow: 0 });
      continue;
    }
    if (!source.configured()) {
      reports.push({ id: source.id, state: "not_configured", listings: 0, dropped: 0, closed: 0, outOfWindow: 0 });
      continue;
    }
    const got = collected.find((c) => c.source.id === source.id);
    if (!got) {
      reports.push({ id: source.id, state: "empty", listings: 0, dropped: 0, closed: 0, outOfWindow: 0 });
      continue;
    }
    const { run } = got;
    const kept = run.listings.filter((l) => inWindow(l.postedAt, query.postedWithinDays, now));
    perSource.push(kept.map((listing) => ({ source: source.id as JobProvider, listing })));

    const base = {
      id: source.id,
      listings: kept.length,
      dropped: run.dropped,
      closed: run.closed,
      outOfWindow: run.listings.length - kept.length,
      ...(run.boards ? { boardsFailed: run.boards.failed, boardsTotal: run.boards.total } : {}),
    };
    if (run.failure && run.listings.length === 0) {
      reports.push({ ...base, state: "failed", failureKind: run.failure.kind, httpStatus: run.failure.httpStatus });
      continue;
    }
    const health = assessHealth({
      received: run.listings.length,
      dropped: run.dropped,
      companies: run.listings.map((l) => l.company),
      titlesWithResidue: run.listings.filter((l) => hasResidue(l.title)).length,
      boardsFailed: run.boards?.failed ?? 0,
    });
    reports.push({ ...base, ...health });
  }

  // Interleave across sources, then collapse exact duplicates — the same
  // posting at the same place from two boards (R14). Same posting, other
  // places, are kept: the view groups them into one card with "also in".
  const merged: Array<{ source: JobProvider; listing: JobListingIn }> = [];
  for (let i = 0; perSource.some((list) => i < list.length); i++) {
    for (const list of perSource) if (i < list.length) merged.push(list[i]);
  }
  const seen = new Set<string>();
  const capped = merged
    .filter(({ source, listing }) => {
      const key = `${jobKey({ ...listing, id: `${source}:${listing.externalId}` })}@${listing.location.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_LISTINGS);

  // Upsert each listing into the shared cache (JS-9: no user id on this table).
  const expiresAt = new Date(now + LISTING_TTL_MS);
  const listingRows = await Promise.all(
    capped.map(({ source, listing }) => {
      const fields = {
        url: listing.url,
        title: listing.title,
        company: listing.company,
        location: listing.location,
        snippet: listing.snippet,
        description: listing.description,
        postedAt: listing.postedAt && Number.isFinite(Date.parse(listing.postedAt)) ? new Date(listing.postedAt) : null,
        salaryMin: listing.salaryMin,
        salaryMax: listing.salaryMax,
        currency: listing.currency,
        salaryPeriod: listing.salaryPeriod,
        skills: listing.skills,
        workMode: listing.workMode,
        minYears: listing.minYears,
        repostCount: listing.repostCount,
        massPostingCount: listing.massPostingCount,
        raw: listing.raw as object,
        expiresAt,
      };
      return db.jobListing.upsert({
        where: { source_externalId: { source, externalId: listing.externalId } },
        create: { source, externalId: listing.externalId, ...fields },
        // A repeat listing refreshes its cache window and content — a stale
        // salary or a since-edited title should not persist for 30 days
        // past when we last actually saw it.
        update: fields,
        select: { id: true },
      });
    }),
  );

  const search = await db.jobSearch.create({
    data: {
      clerkUserId,
      queryHash: queryHash(query),
      titles: query.titles,
      location: query.location,
      remote: query.remote,
      postedWithinDays: query.postedWithinDays,
      resultCount: listingRows.length,
      sources: active.map((s) => s.id),
      sourceReport: reports as unknown as object,
      // `rank` is the stored, interleaved order — the triage re-sorts on
      // every read, so this is only ever its last tie-breaker.
      hits: { create: listingRows.map((row, i) => ({ listingId: row.id, rank: i })) },
    },
    select: { id: true },
  });

  // Counts only — never a title, a city, a company or a query term (N7/JS-8).
  console.info(
    `[jobs] search hash=${queryHash(query).slice(0, 12)} variants=${variants.length} kept=${listingRows.length} ` +
      reports.map((r) => `${r.id}:${r.state}/${r.listings}/d${r.dropped}/c${r.closed}/w${r.outOfWindow}`).join(" "),
  );

  return { searchId: search.id };
}

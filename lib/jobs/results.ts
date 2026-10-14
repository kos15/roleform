import "server-only";
import { db } from "@/lib/db";
import { profileFacts } from "@/lib/domain/job-query";
import { jobKey } from "@/lib/domain/job-key";
import {
  marketGaps,
  TIER_LABEL,
  TIER_ORDER,
  triageAll,
  type MarketGap,
  type Tier,
  type TriageInput,
} from "@/lib/domain/job-triage";
import { describeHealth, readReports } from "@/lib/domain/job-health";
import { contactLinks, formatSalary } from "@/lib/domain/job-portals";
import { sourceLabel } from "./search";
import type { StoredResume } from "@/lib/ai/schemas/resume-json";
import type { JobProvider, SavedJobStatus } from "@/lib/generated/prisma/enums";

/**
 * A search, read back as the page shows it (F22.1).
 *
 * The triage runs here, on every read, from the stored hits and the
 * member's current profile — never stored, so editing the profile re-sorts
 * an old search the next time it's opened, and the same rows always give the
 * same page. "New" and "Saved" come from the member's own earlier hits and
 * saved rows; no per-user "seen" table is needed for that (R15).
 */

export interface ListingCardView {
  id: string;
  source: JobProvider;
  sourceLabel: string;
  title: string;
  company: string;
  location: string;
  url: string;
  snippet: string;
  /** True when the provider gave the full posting — Analyse hands it over whole. */
  hasFullPosting: boolean;
  postedAt: string | null;
  ageDays: number | null;
  salary: string | null;
  tier: Tier;
  matchedSkills: string[];
  askedSkills: string[];
  strengths: string[];
  cautions: string[];
  locationVerdict: "pass" | "flag" | "fail" | "unchecked";
  alsoIn: string[];
  alsoVia: string[];
  isNew: boolean;
  saved: { status: SavedJobStatus } | null;
  contacts: { recruiters: string; team: string } | null;
}

export interface ResultsView {
  searchId: string;
  fromCache: boolean;
  createdAt: string;
  postedWithinDays: number;
  total: number;
  newCount: number;
  tiers: Array<{ tier: Tier; label: string; cards: ListingCardView[] }>;
  gaps: MarketGap[];
  /** Sources that returned at least one listing — attribution is unconditional for these (JS-6). */
  attributions: Array<{ id: string; label: string; url: string }>;
  /** One sentence per unhealthy source; healthy sources are silent (R28). */
  health: string[];
}

/** How far back "New" looks: the member's last 20 searches. Bounded, not a crawl. */
const PRIOR_SEARCHES = 20;

export async function loadResults(
  clerkUserId: string,
  searchId: string,
  resume: StoredResume,
  fromCache: boolean,
): Promise<ResultsView | null> {
  const search = await db.jobSearch.findFirst({
    where: { id: searchId, clerkUserId },
    select: {
      id: true,
      createdAt: true,
      postedWithinDays: true,
      sourceReport: true,
      hits: {
        orderBy: { rank: "asc" },
        select: { rank: true, listing: true },
      },
    },
  });
  if (!search) return null;

  const now = new Date();
  const live = search.hits.filter((h) => h.listing.expiresAt > now);

  const [prior, saved] = await Promise.all([
    db.jobSearch.findMany({
      where: { clerkUserId, createdAt: { lt: search.createdAt } },
      orderBy: { createdAt: "desc" },
      take: PRIOR_SEARCHES,
      select: { hits: { select: { listing: { select: { id: true, company: true, title: true } } } } },
    }),
    db.savedJob.findMany({
      where: { clerkUserId },
      select: { listingId: true, status: true, listing: { select: { id: true, company: true, title: true } } },
    }),
  ]);

  const seenKeys = new Set(prior.flatMap((s) => s.hits.map((h) => jobKey(h.listing))));
  const savedById = new Map(saved.map((s) => [s.listingId, s.status]));
  const savedByKey = new Map(saved.map((s) => [jobKey(s.listing), s.status]));

  type Input = TriageInput & { row: (typeof live)[number]["listing"] };
  const inputs: Input[] = live.map((h) => ({
    id: h.listing.id,
    source: h.listing.source,
    title: h.listing.title,
    company: h.listing.company,
    location: h.listing.location,
    text: h.listing.description || h.listing.snippet,
    skills: h.listing.skills,
    workMode: h.listing.workMode,
    minYears: h.listing.minYears,
    postedAt: h.listing.postedAt,
    repostCount: h.listing.repostCount,
    massPostingCount: h.listing.massPostingCount,
    order: h.rank,
    row: h.listing,
  }));

  const triaged = triageAll(inputs, profileFacts(resume, now), now);

  const cards: ListingCardView[] = triaged.map(({ listing, triage, alsoIn, alsoVia, key }) => {
    const row = listing.row;
    const savedStatus = savedById.get(row.id) ?? savedByKey.get(key) ?? null;
    const worthContacting = triage.tier === "shortlist" || triage.tier === "consider";
    return {
      id: row.id,
      source: row.source,
      sourceLabel: sourceLabel(row.source).label,
      title: row.title,
      company: row.company,
      location: row.location,
      url: row.url,
      snippet: (row.description || row.snippet).slice(0, 360),
      hasFullPosting: row.description.length > 0,
      postedAt: row.postedAt ? row.postedAt.toISOString() : null,
      ageDays: triage.ageDays,
      salary: formatSalary(row.salaryMin, row.salaryMax, row.currency, row.salaryPeriod),
      tier: triage.tier,
      matchedSkills: triage.matchedSkills,
      askedSkills: triage.askedSkills,
      strengths: triage.strengths,
      cautions: triage.cautions,
      locationVerdict: triage.location.verdict,
      alsoIn,
      alsoVia: alsoVia.map((id) => sourceLabel(id).label),
      isNew: !seenKeys.has(key) && savedStatus === null,
      saved: savedStatus ? { status: savedStatus } : null,
      contacts: worthContacting ? contactLinks(row.company, row.title) : null,
    };
  });

  const reports = readReports(search.sourceReport);
  const withResults = new Set(live.map((h) => h.listing.source as string));

  return {
    searchId: search.id,
    fromCache,
    createdAt: search.createdAt.toISOString(),
    postedWithinDays: search.postedWithinDays,
    total: cards.length,
    newCount: cards.filter((c) => c.isNew).length,
    tiers: TIER_ORDER.map((tier) => ({
      tier,
      label: TIER_LABEL[tier],
      cards: cards.filter((c) => c.tier === tier),
    })),
    gaps: marketGaps(triaged),
    attributions: [...withResults].map((id) => ({ id, ...sourceLabel(id) })),
    health: reports
      .filter((r) => r.state !== "not_configured" && r.state !== "disabled")
      .map((r) => describeHealth(r, sourceLabel(r.id).label))
      .filter((s): s is string => s !== null),
  };
}

/** The member's most recent search, for the page's first render. */
export async function latestSearchId(clerkUserId: string): Promise<string | null> {
  const row = await db.jobSearch.findFirst({
    where: { clerkUserId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return row?.id ?? null;
}

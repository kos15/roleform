/**
 * Deep-link-out buttons for the big job portals (F22 addendum).
 *
 * NOT a `JobSource` (lib/jobs/sources/*.ts) — no request ever leaves this
 * server for these, and nothing here is ever fetched, parsed or stored.
 * Each entry is a pure URL builder against a portal's own public search
 * page, filled in with the member's own query. N17 ("documented APIs only,
 * no scraping") governs in-app RESULTS — rows this product shows as its
 * own, evidenced findings. It says nothing about pointing a member at a
 * page they could have typed the URL for themselves; that's the same trust
 * a "search this on Google" link asks for, not a data source.
 *
 * Never shown beside a match, a score or a skill chip (N20) — these carry no
 * claim about fit at all, which is the whole reason they're allowed to
 * exist without going through a JobSource.
 *
 * PURE. No I/O, no fetch — lib/domain imports nothing from db, ai, supabase
 * or next (CLAUDE.md §10).
 */
import type { JobQuery } from "./job-query";

export interface JobPortalLink {
  id: string;
  label: string;
  url(query: Pick<JobQuery, "titles" | "location" | "remote">): string;
}

/** Lowercase, ascii, hyphen-joined — Naukri's own SEO path segments want this, not percent-encoding. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * The first stated title, same "one primary term" rule
 * `lib/jobs/sources/{adzuna,jooble}.ts` already uses — none of these portals'
 * search boxes take a list.
 */
function primaryTitle(query: Pick<JobQuery, "titles">): string {
  return query.titles[0]?.trim() ?? "";
}

/**
 * `buildJobQuery` joins city and country code ("Pune, IN") for the
 * providers that want that shape; a portal's own search box wants just the
 * city.
 */
function city(query: Pick<JobQuery, "location">): string {
  return query.location.split(",")[0]?.trim() ?? "";
}

/**
 * Naukri first, deliberately — the default a member reaches for without
 * being asked, in the market this product ships to first.
 */
export const JOB_PORTALS: JobPortalLink[] = [
  {
    id: "naukri",
    label: "Naukri",
    url: (q) => {
      const title = slug(primaryTitle(q) || "jobs");
      const loc = city(q);
      const path = `${title}-jobs${loc ? `-in-${slug(loc)}` : ""}`;
      // Naukri's own remote filter — a query param, not a path segment.
      return q.remote ? `https://www.naukri.com/${path}?wfhType=2` : `https://www.naukri.com/${path}`;
    },
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    url: (q) => {
      const params = new URLSearchParams();
      if (primaryTitle(q)) params.set("keywords", primaryTitle(q));
      if (city(q)) params.set("location", city(q));
      // LinkedIn's own remote-filter value — 1 on-site, 2 remote, 3 hybrid.
      if (q.remote) params.set("f_WT", "2");
      return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
    },
  },
  {
    id: "indeed",
    label: "Indeed",
    url: (q) => {
      const params = new URLSearchParams();
      if (primaryTitle(q)) params.set("q", primaryTitle(q));
      const loc = city(q);
      if (loc) params.set("l", q.remote ? `${loc} (Remote)` : loc);
      return `https://in.indeed.com/jobs?${params.toString()}`;
    },
  },
  {
    id: "glassdoor",
    label: "Glassdoor",
    url: (q) => {
      // Keyword-only, deliberately: Glassdoor resolves a location through an
      // internal `locId` its own autocomplete assigns, not the plain city
      // name — `locKeyword` alone is documented as silently ignored. A link
      // that looked location-scoped and wasn't would be a worse trust break
      // than one that's honest about only filtering on title.
      const params = new URLSearchParams();
      if (primaryTitle(q)) params.set("sc.keyword", primaryTitle(q));
      return `https://www.glassdoor.co.in/Job/jobs.htm?${params.toString()}`;
    },
  },
];

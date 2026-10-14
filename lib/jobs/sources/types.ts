/**
 * The job-source adapter contract (F22, N17/N18; F22.1, R1/R5/R28).
 *
 * One file per documented API this deployment is keyed for — never a scrape,
 * never a fetch of an employer's own page. Registering a source is adding a
 * value to the `JobProvider` enum, a file here, and a line in
 * `lib/jobs/search.ts`; nothing else in the app calls a provider directly.
 *
 * An adapter never throws and never hides a failure: it returns a
 * `SourceRun` saying what happened — the listings that parsed, how many
 * records were dropped at the boundary, and whether the call failed — so the
 * page can name the source that failed instead of quietly showing fewer
 * results (F22 acceptance; R28).
 */
import "server-only";
import { z } from "zod";
import type { JobQuery } from "@/lib/domain/job-query";
import { cleanLine, cleanText } from "@/lib/domain/job-text";

export type { JobQuery };

const WORK_MODES = ["remote", "hybrid", "onsite"] as const;

/**
 * One listing, as a provider returns it, crossing the boundary through this
 * schema (N18/JS-2) — never trusted raw. `url` is the provider's own field;
 * nothing in this codebase assembles one.
 */
export const JobListingInSchema = z.object({
  externalId: z.string().min(1).max(512),
  url: z.url(),
  title: z.string().min(1).max(300),
  company: z.string().max(200).default(""),
  location: z.string().max(300).default(""),
  snippet: z.string().max(4_000).default(""),
  /** The full posting, when the provider sends one (freehire). */
  description: z.string().max(40_000).default(""),
  postedAt: z.string().nullable().default(null),
  salaryMin: z.number().int().nonnegative().nullable().default(null),
  salaryMax: z.number().int().nonnegative().nullable().default(null),
  currency: z.string().max(8).nullable().default(null),
  salaryPeriod: z.string().max(16).nullable().default(null),
  skills: z.array(z.string().min(1).max(60)).max(60).default([]),
  workMode: z.enum(WORK_MODES).nullable().default(null),
  minYears: z.number().int().min(0).max(40).nullable().default(null),
  repostCount: z.number().int().nonnegative().nullable().default(null),
  massPostingCount: z.number().int().nonnegative().nullable().default(null),
  /** The provider's own record, kept for re-normalisation. Never rendered. */
  raw: z.record(z.string(), z.unknown()).default({}),
});

export type JobListingIn = z.infer<typeof JobListingInSchema>;

export type SourceId = "adzuna" | "jooble" | "freehire" | "greenhouse" | "lever" | "ashby";

/** What one source did for one search. Counts and codes only — never content (N7). */
export interface SourceRun {
  listings: JobListingIn[];
  /** Records that failed the schema (N18) — dropped and counted, never coerced. */
  dropped: number;
  /** Records the provider itself marks closed (R17) — dropped and counted. */
  closed: number;
  /** Null when every call this run made came back 2xx. */
  failure: { kind: "timeout" | "network" | "http" | "body"; httpStatus?: number } | null;
  /**
   * Board-backed sources (Greenhouse, Lever, Ashby — F22.2) read many
   * employer boards per search; how many didn't answer. Absent elsewhere.
   */
  boards?: { failed: number; total: number };
}

export interface JobSource {
  id: SourceId;
  /** Shown on every results view carrying at least one listing from this source (JS-6/JS-8). */
  attribution: { label: string; url: string };
  /**
   * True when this deployment has the keys this source needs. Checked before
   * `search` is called so an unkeyed source is reported as "not configured"
   * rather than attempted and failing.
   */
  configured(): boolean;
  /**
   * One keyword variant (`planKeywords`) against this provider. The query
   * carries the rest of the N19 payload: city, remote flag, window.
   */
  search(keywords: string, query: JobQuery, signal: AbortSignal): Promise<SourceRun>;
}

export function emptyRun(failure: SourceRun["failure"] = null): SourceRun {
  return { listings: [], dropped: 0, closed: 0, failure };
}

/** A fetch that never throws: the caller's abort is a timeout, anything else is network. */
export async function fetchJson(
  url: string,
  init: RequestInit & { signal: AbortSignal },
): Promise<{ body: unknown } | { failure: NonNullable<SourceRun["failure"]> }> {
  // One retry on 429/5xx inside the same budget (R7): the caller's abort
  // signal still bounds the whole thing, so a retry can never overrun 8s.
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch {
      return { failure: { kind: init.signal.aborted ? "timeout" : "network" } };
    }
    if ((response.status === 429 || response.status >= 500) && attempt === 0) {
      try {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, 600);
          init.signal.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new Error("aborted"));
          }, { once: true });
        });
      } catch {
        return { failure: { kind: "timeout" } };
      }
      continue;
    }
    if (!response.ok) return { failure: { kind: "http", httpStatus: response.status } };
    try {
      return { body: await response.json() };
    } catch {
      return { failure: { kind: init.signal.aborted ? "timeout" : "body" } };
    }
  }
  return { failure: { kind: "http", httpStatus: 429 } };
}

/**
 * JS-2: tidy provider text (entities, tags — R28), then parse through the
 * schema; drop and count what fails.
 */
export function parseListings(raw: Array<Record<string, unknown>>): { listings: JobListingIn[]; dropped: number } {
  const listings: JobListingIn[] = [];
  let dropped = 0;
  for (const item of raw) {
    const parsed = JobListingInSchema.safeParse(tidy(item));
    if (parsed.success) listings.push(parsed.data);
    else dropped++;
  }
  return { listings, dropped };
}

function tidy(item: Record<string, unknown>): Record<string, unknown> {
  const line = (v: unknown) => (typeof v === "string" ? cleanLine(v) : v);
  const block = (v: unknown) => (typeof v === "string" ? cleanText(v) : v);
  return {
    ...item,
    title: line(item.title),
    company: line(item.company),
    location: line(item.location),
    snippet: block(item.snippet),
    description: block(item.description),
  };
}

/** The provider's own work-mode word, onto our three — or null. Never guessed. */
export function workModeOf(raw: unknown): (typeof WORK_MODES)[number] | null {
  if (typeof raw !== "string") return null;
  const v = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (v === "remote") return "remote";
  if (v === "hybrid") return "hybrid";
  if (v === "onsite" || v === "office" || v === "inoffice") return "onsite";
  return null;
}

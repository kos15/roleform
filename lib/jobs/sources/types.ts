/**
 * The job-source adapter contract (F22, N17/N18).
 *
 * One file per documented API this deployment is keyed for — never a scrape,
 * never a fetch of an employer's own page. Registering a source is adding a
 * value to the `JobProvider` enum, a file here, and a line in
 * `lib/jobs/search.ts`; nothing else in the app calls a provider directly.
 */
import "server-only";
import { z } from "zod";

/** What leaves this server toward a provider (N19). Nothing else. */
export interface JobQuery {
  titles: string[];
  skills: string[];
  location: string;
  remote: boolean;
}

/**
 * One listing, as a provider returns it, crossing the boundary through this
 * schema (N18/JS-2) — never trusted raw. `url` is the provider's own field;
 * nothing in this codebase assembles one.
 */
export const JobListingInSchema = z.object({
  externalId: z.string().min(1),
  url: z.url(),
  title: z.string().min(1),
  company: z.string().default(""),
  location: z.string().default(""),
  snippet: z.string().default(""),
  postedAt: z.string().nullable().default(null),
  salaryMin: z.number().int().nullable().default(null),
  salaryMax: z.number().int().nullable().default(null),
  currency: z.string().nullable().default(null),
  /** The provider's own record, kept for re-normalisation. Never rendered. */
  raw: z.record(z.string(), z.unknown()).default({}),
});

export type JobListingIn = z.infer<typeof JobListingInSchema>;

export interface JobSource {
  id: "adzuna" | "jooble";
  /** Shown on every results view carrying at least one listing from this source (JS-6/JS-8). */
  attribution: { label: string; url: string };
  /**
   * True when this deployment has the keys this source needs. Checked before
   * `search` is called so an unkeyed source is reported as "not configured"
   * rather than attempted and failing.
   */
  configured(): boolean;
  search(query: JobQuery, signal: AbortSignal): Promise<JobListingIn[]>;
}

/** JS-2: parse the provider's response through the schema; drop and count what fails. */
export function parseListings(raw: unknown[]): { listings: JobListingIn[]; dropped: number } {
  const listings: JobListingIn[] = [];
  let dropped = 0;
  for (const item of raw) {
    const parsed = JobListingInSchema.safeParse(item);
    if (parsed.success) listings.push(parsed.data);
    else dropped++;
  }
  return { listings, dropped };
}

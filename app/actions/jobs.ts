"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, checkJobSearchAllowance } from "@/lib/services/auth";
import { rateLimit, LIMITS } from "@/lib/services/rate-limit";
import { getProfile } from "@/lib/db/queries/profile";
import { buildJobQuery, clampPostedWithin, type JobQuery } from "@/lib/domain/job-query";
import { findCachedSearchId, runSearch } from "@/lib/services/jobs/search";
import { loadResults, type ResultsView } from "@/lib/services/jobs/results";
import { appError, err, ok, type Result } from "@/lib/domain/types";
import type { SavedJobStatus } from "@/lib/generated/prisma/enums";
import type { StoredResume } from "@/lib/ai/schemas/resume-json";
import { requireFeature } from "@/lib/services/features";

/**
 * Job search (F22).
 *
 * Free never reaches this function's body past the cap check — `capJobSearches`
 * is 0 on Free, so `checkJobSearchAllowance` refuses before either adapter is
 * ever called (JS-9). A repeat of the same query inside the 12h cache window
 * is read back and costs no cap unit and no outbound request (JS-4).
 *
 * F22.1: the result comes back triaged (lib/services/jobs/results.ts) — tiers, named
 * reasons, New/Saved flags, market gaps and source health — all computed on
 * read from rows, never by a model (N13).
 */
export async function searchJobs(overrides?: {
  titles?: string[];
  location?: string;
  remote?: boolean;
  postedWithinDays?: number;
}): Promise<Result<ResultsView>> {
  const featureOn = await requireFeature("jobs");
  if (!featureOn.ok) return featureOn;
  const user = await requireUser();
  if (!user.ok) return user;

  const profile = await getProfile(user.value);
  if (!profile) {
    return err(appError("not_found", "Import your résumé first — there's nothing to search against yet."));
  }

  const resume = profile.resumeJson as unknown as StoredResume;
  const base = buildJobQuery(resume);
  const query: JobQuery = {
    // Bounded here, not only in the editor: the payload is N19's, and its size is ours.
    titles: (overrides?.titles ?? base.titles).map((t) => t.trim().slice(0, 80)).filter(Boolean).slice(0, 5),
    skills: base.skills,
    location: (overrides?.location ?? base.location).trim().slice(0, 80),
    remote: overrides?.remote ?? base.remote,
    postedWithinDays: clampPostedWithin(overrides?.postedWithinDays),
  };

  // JS-4: a cache hit costs nothing — checked before the cap and before any
  // outbound request, the same "free path first" shape the token wall uses.
  const cachedId = await findCachedSearchId(user.value, query);
  if (cachedId) {
    const view = await loadResults(user.value, cachedId, resume, true);
    if (view) return ok(view);
  }

  const limited = rateLimit(`jobsearch:${user.value}`, LIMITS.jobSearch.limit, LIMITS.jobSearch.windowSeconds);
  if (!limited.allowed) {
    return err(
      appError("invalid_input", `Too many searches at once. Try again in ${limited.retryAfterSeconds}s.`),
    );
  }

  const allowance = await checkJobSearchAllowance(user.value);
  if (!allowance.ok) return allowance;

  const { searchId } = await runSearch(user.value, query);
  const view = await loadResults(user.value, searchId, resume, false);
  if (!view) return err(appError("storage_failed", "That search ran but couldn't be read back. Try again."));
  revalidatePath("/jobs");
  return ok(view);
}

/** Save a listing, idempotently (a second click just leaves the row where it is). */
export async function saveJob(listingId: string): Promise<Result<{ savedJobId: string }>> {
  const featureOn = await requireFeature("jobs");
  if (!featureOn.ok) return featureOn;
  const user = await requireUser();
  if (!user.ok) return user;

  const listing = await db.jobListing.findUnique({ where: { id: listingId }, select: { id: true } });
  if (!listing) return err(appError("not_found", "That listing is no longer available."));

  const row = await db.savedJob.upsert({
    where: { clerkUserId_listingId: { clerkUserId: user.value, listingId } },
    create: { clerkUserId: user.value, listingId },
    update: {},
    select: { id: true },
  });

  revalidatePath("/jobs");
  return ok({ savedJobId: row.id });
}

export async function unsaveJob(savedJobId: string): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;

  await db.savedJob.deleteMany({ where: { id: savedJobId, clerkUserId: user.value } });
  revalidatePath("/jobs");
  return ok(null);
}

/**
 * Status change, from a tracker's own vocabulary. `applied` stamps
 * `applied_at` — the CHECK constraint (`saved_jobs_applied_has_date`) is the
 * real guarantee; this is what keeps a caller from ever hitting it.
 */
export async function setSavedJobStatus(
  savedJobId: string,
  status: SavedJobStatus,
  note?: string,
): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const updated = await db.savedJob.updateMany({
    where: { id: savedJobId, clerkUserId: user.value },
    data: {
      status,
      // `undefined` leaves an existing appliedAt where it is rather than
      // clearing it — moving off "applied" later (e.g. to "interviewing")
      // keeps the date something WAS applied, which is a fact worth keeping,
      // not a value undefined here because there is one to protect.
      appliedAt: status === "applied" ? new Date() : undefined,
      ...(note !== undefined ? { note } : {}),
    },
  });
  if (updated.count === 0) return err(appError("not_found", "That saved job isn't yours to change."));

  revalidatePath("/jobs");
  return ok(null);
}

/** The member's own note on a saved job — user-authored, never derived (N3 applied). */
export async function setSavedJobNote(savedJobId: string, note: string): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const updated = await db.savedJob.updateMany({
    where: { id: savedJobId, clerkUserId: user.value },
    data: { note: note.slice(0, 2_000) },
  });
  if (updated.count === 0) return err(appError("not_found", "That saved job isn't yours to change."));

  revalidatePath("/jobs");
  return ok(null);
}

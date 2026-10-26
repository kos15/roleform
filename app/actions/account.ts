"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/services/auth";
import { BUCKET_EXPORTS, BUCKET_RESUMES, removePrefix } from "@/lib/supabase/storage";
import { appError, err, ok, type Result } from "@/lib/domain/types";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { setClerkName } from "@/lib/services/account/name";

/**
 * Account deletion (M7.4, specs §11).
 *
 * Delete means hard delete of rows AND storage objects within 24h — here it is
 * immediate. Both halves matter: rows alone would leave the user's actual
 * résumé sitting in a bucket, which is the part they'd care about most.
 *
 * tailored_bullets → experience_bullets is ON DELETE RESTRICT (N1), so drafts
 * must go before the profile. That ordering is deliberate; the constraint is
 * doing its job by refusing any other sequence.
 */
export async function deleteAccount(): Promise<Result<{ objectsDeleted: number }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const clerkUserId = user.value;

  const objectsDeleted =
    (await removePrefix(BUCKET_EXPORTS, clerkUserId)) +
    (await removePrefix(BUCKET_RESUMES, clerkUserId));

  await db.$transaction([
    // analyses cascade into requirements, coverage, drafts, tailored bullets,
    // questions, gaps and roadmaps (ON DELETE CASCADE). saved_jobs and
    // job_searches cascade from the user row below the same way token_grants
    // always has — neither needs its own deleteMany here.
    db.analysis.deleteMany({ where: { clerkUserId } }),
    db.export.deleteMany({ where: { clerkUserId } }),
    // F28: no FK to users, so it goes by subject like exports.
    db.portfolioSite.deleteMany({ where: { clerkUserId } }),
    db.masterProfile.deleteMany({ where: { clerkUserId } }),
    db.sourceDocument.deleteMany({ where: { clerkUserId } }),
    db.aiRun.deleteMany({ where: { clerkUserId } }),
    // The one table with no FK to users (its subject may be NULL for a
    // signed-out sender). Rows outlive the account; the subject does not
    // (N7, G13) — same fix as the Clerk `user.deleted` path.
    db.contactMessage.updateMany({ where: { clerkUserId }, data: { clerkUserId: null } }),
    db.user.deleteMany({ where: { clerkUserId } }),
  ]);

  return ok({ objectsDeleted });
}

const NameSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60),
});

/**
 * The account's own name (F33) — what the header greets you by. Written to
 * Clerk, the source of truth for identity; we keep no copy (N7).
 */
export async function updateAccountName(input: { firstName: string; lastName: string }): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = NameSchema.safeParse(input);
  if (!parsed.success) return err(appError("invalid_input", "Add at least a first name (up to 60 characters)."));
  const saved = await setClerkName(user.value, parsed.data.firstName, parsed.data.lastName);
  if (!saved) return err(appError("upstream_failed", "We couldn't reach the sign-in service. Try again in a moment."));
  revalidatePath("/", "layout");
  return ok(null);
}

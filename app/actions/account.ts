"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { BUCKET_EXPORTS, BUCKET_RESUMES, removePrefix } from "@/lib/supabase/storage";
import { ok, type Result } from "@/lib/domain/types";

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
    // questions and gaps.
    db.analysis.deleteMany({ where: { clerkUserId } }),
    db.export.deleteMany({ where: { clerkUserId } }),
    db.masterProfile.deleteMany({ where: { clerkUserId } }),
    db.sourceDocument.deleteMany({ where: { clerkUserId } }),
    db.aiRun.deleteMany({ where: { clerkUserId } }),
    db.user.deleteMany({ where: { clerkUserId } }),
  ]);

  return ok({ objectsDeleted });
}

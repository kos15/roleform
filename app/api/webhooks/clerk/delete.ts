import "server-only";
import { db } from "@/lib/db";
import { BUCKET_EXPORTS, BUCKET_RESUMES, removePrefix } from "@/lib/supabase/storage";

/**
 * Hard delete triggered by Clerk's `user.deleted` event.
 *
 * Same ordering as the in-app deleteAccount action: analyses (and everything
 * cascading from them) before the profile, because tailored_bullets →
 * experience_bullets is ON DELETE RESTRICT (N1).
 */
export async function deleteEverythingFor(clerkUserId: string): Promise<void> {
  await removePrefix(BUCKET_EXPORTS, clerkUserId);
  await removePrefix(BUCKET_RESUMES, clerkUserId);

  await db.$transaction([
    db.analysis.deleteMany({ where: { clerkUserId } }),
    db.export.deleteMany({ where: { clerkUserId } }),
    db.masterProfile.deleteMany({ where: { clerkUserId } }),
    db.sourceDocument.deleteMany({ where: { clerkUserId } }),
    db.aiRun.deleteMany({ where: { clerkUserId } }),
    db.user.deleteMany({ where: { clerkUserId } }),
  ]);
}

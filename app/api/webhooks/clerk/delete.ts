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
    // roadmaps/roadmap_items cascade from analyses (ON DELETE CASCADE);
    // saved_jobs/job_searches cascade from the user row below (ON DELETE
    // CASCADE on their own clerk_user_id FK) — neither needs its own
    // deleteMany here, the same way token_grants never has.
    db.analysis.deleteMany({ where: { clerkUserId } }),
    db.export.deleteMany({ where: { clerkUserId } }),
    db.masterProfile.deleteMany({ where: { clerkUserId } }),
    db.sourceDocument.deleteMany({ where: { clerkUserId } }),
    db.aiRun.deleteMany({ where: { clerkUserId } }),
    // contact_messages has no FK to users — it is the one table whose subject
    // may be NULL, for a signed-out sender with no account to key on (specs
    // §6.2). Its rows outlive the account by design (an admin may still need
    // to read a past message), but the identifying subject does not (N7, G13).
    db.contactMessage.updateMany({ where: { clerkUserId }, data: { clerkUserId: null } }),
    db.user.deleteMany({ where: { clerkUserId } }),
  ]);
}

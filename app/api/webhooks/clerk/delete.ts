import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  aiRuns,
  analyses,
  exports as exportsTable,
  masterProfiles,
  sourceDocuments,
  users,
} from "@/lib/db/schema";
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

  await db.transaction(async (tx) => {
    await tx.delete(analyses).where(eq(analyses.clerkUserId, clerkUserId));
    await tx.delete(exportsTable).where(eq(exportsTable.clerkUserId, clerkUserId));
    await tx.delete(masterProfiles).where(eq(masterProfiles.clerkUserId, clerkUserId));
    await tx.delete(sourceDocuments).where(eq(sourceDocuments.clerkUserId, clerkUserId));
    await tx.delete(aiRuns).where(eq(aiRuns.clerkUserId, clerkUserId));
    await tx.delete(users).where(eq(users.clerkUserId, clerkUserId));
  });
}

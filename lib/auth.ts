import "server-only";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/**
 * Session subject for a Server Action.
 *
 * Every action calls this and scopes its queries by the result. RLS is the
 * second lock (CLAUDE.md §7) — this is the first one, and the Drizzle
 * connection bypasses RLS, so skipping it is a data leak, not a style issue.
 */
export async function requireUser(): Promise<Result<string>> {
  const { userId } = await auth();
  if (!userId) return err(appError("unauthenticated", "Please sign in."));
  return ok(userId);
}

/**
 * Quota check (M7.2). Exhaustion blocks NEW analyses only — past analyses stay
 * fully readable. We never lock a user out of their own data (specs §13).
 */
export async function consumeAnalysisQuota(clerkUserId: string): Promise<Result<number>> {
  const [row] = await db
    .select({ quotaRemaining: users.quotaRemaining })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId));

  if (!row) return err(appError("not_found", "We couldn't find your account."));
  if (row.quotaRemaining <= 0) {
    return err(
      appError(
        "quota_exhausted",
        "You've used this month's analyses. Your existing analyses stay available.",
      ),
    );
  }

  const [updated] = await db
    .update(users)
    .set({ quotaRemaining: sql`${users.quotaRemaining} - 1` })
    .where(eq(users.clerkUserId, clerkUserId))
    .returning({ quotaRemaining: users.quotaRemaining });

  return ok(updated.quotaRemaining);
}

export async function refundAnalysisQuota(clerkUserId: string): Promise<void> {
  await db
    .update(users)
    .set({ quotaRemaining: sql`${users.quotaRemaining} + 1` })
    .where(eq(users.clerkUserId, clerkUserId));
}

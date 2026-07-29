import "server-only";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/**
 * Session subject for a Server Action.
 *
 * Every action calls this and scopes its queries by the result. RLS is the
 * second lock (CLAUDE.md §7) — this is the first one, and the Prisma
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
  const row = await db.user.findUnique({
    where: { clerkUserId },
    select: { quotaRemaining: true },
  });

  if (!row) return err(appError("not_found", "We couldn't find your account."));
  if (row.quotaRemaining <= 0) {
    return err(
      appError(
        "quota_exhausted",
        "You've used this month's analyses. Your existing analyses stay available.",
      ),
    );
  }

  const updated = await db.user.update({
    where: { clerkUserId },
    data: { quotaRemaining: { decrement: 1 } },
    select: { quotaRemaining: true },
  });

  return ok(updated.quotaRemaining);
}

export async function refundAnalysisQuota(clerkUserId: string): Promise<void> {
  await db.user.update({
    where: { clerkUserId },
    data: { quotaRemaining: { increment: 1 } },
  });
}

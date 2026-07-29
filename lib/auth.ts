import "server-only";
import { createHash } from "node:crypto";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/** N7: the address itself is never stored, only enough to de-duplicate. */
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase()).digest("hex");
}

/**
 * Create the account row if the webhook hasn't yet.
 *
 * The Clerk `user.created` webhook is the primary path, but it is best-effort:
 * unconfigured locally, delayed behind a retry, or simply losing the race with
 * a user who signs up and clicks straight through. Every one of those leaves a
 * signed-in person with no row and no way to act. Idempotent upsert, so the
 * webhook arriving late is a no-op rather than a conflict.
 */
export async function provisionUser(clerkUserId: string): Promise<void> {
  const clerk = await currentUser();
  const email =
    clerk?.primaryEmailAddress?.emailAddress ?? clerk?.emailAddresses?.[0]?.emailAddress ?? "";

  await db.user.upsert({
    where: { clerkUserId },
    create: { clerkUserId, emailHash: hashEmail(email) },
    update: {},
  });
}

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
  let row = await db.user.findUnique({
    where: { clerkUserId },
    select: { quotaRemaining: true },
  });

  // A signed-in subject with no row means the webhook hasn't landed. Provision
  // rather than refuse — the session is proof the account exists.
  if (!row) {
    await provisionUser(clerkUserId);
    row = await db.user.findUnique({
      where: { clerkUserId },
      select: { quotaRemaining: true },
    });
  }

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
  // updateMany so a refund on a since-deleted account is a no-op rather than a
  // throw inside another failure's cleanup path.
  await db.user.updateMany({
    where: { clerkUserId },
    data: { quotaRemaining: { increment: 1 } },
  });
}

import "server-only";
import { db } from "@/lib/db";
import { draftCount } from "@/lib/domain/entitlements";
import { TEMPLATES } from "@/lib/render/templates";

/**
 * How many drafts THIS member's next run will return.
 *
 * The analyse screen used to promise "six", which was a fixed number for a
 * count that is `capResumes` per member (F15, 0–11) over a catalog that has
 * since grown to eleven. A promise on the way in that the results page then
 * contradicts is worse than no number at all, so both sides read the same
 * clamp — `lib/domain/entitlements.draftCount`, which the pipeline also uses.
 */
export async function draftsPerRun(clerkUserId: string): Promise<number> {
  const account = await db.user.findUnique({
    where: { clerkUserId },
    select: { capResumes: true, role: true },
  });
  if (!account) return TEMPLATES.length;
  return draftCount(account.role, account.capResumes, TEMPLATES.length);
}

import "server-only";
import { cache } from "react";
import { clerkClient, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

/**
 * The member's own name, in two places that should agree (F33).
 *
 * Clerk holds the account's name; the profile holds the name on the résumé
 * (`basics.name`, user-authored — N3). An email-code signup has no name in
 * Clerk at all, so the header had nothing to greet them by. When the profile
 * has a name and Clerk doesn't, the profile's is copied across — never the
 * other way, and never over a name already in Clerk: the account name is the
 * member's to set, and we only fill a blank.
 */

/** "Asha Rao Menon" → first "Asha", last "Rao Menon". One word → first only. */
export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return { firstName: parts[0].slice(0, 60), lastName: parts.slice(1).join(" ").slice(0, 60) };
}

async function profileName(clerkUserId: string): Promise<string> {
  const row = await db.masterProfile.findFirst({
    where: { clerkUserId },
    orderBy: { updatedAt: "desc" },
    select: { resumeJson: true },
  });
  const basics = (row?.resumeJson as { basics?: { name?: unknown } } | null)?.basics;
  return typeof basics?.name === "string" ? basics.name.trim() : "";
}

/**
 * Fill a blank Clerk name from `fullName`. Best-effort: a failure here must
 * never fail a profile save, and the error would carry a subject (N7).
 */
export async function fillClerkNameIfBlank(clerkUserId: string, fullName: string): Promise<string | null> {
  const { firstName, lastName } = splitName(fullName);
  if (!firstName) return null;
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(clerkUserId);
    if (user.firstName?.trim()) return user.firstName.trim();
    await client.users.updateUser(clerkUserId, { firstName, lastName: lastName || undefined });
    return firstName;
  } catch {
    return null;
  }
}

/** Set the Clerk name outright — the member typed it into their own account card. */
export async function setClerkName(clerkUserId: string, firstName: string, lastName: string): Promise<boolean> {
  try {
    const client = await clerkClient();
    await client.users.updateUser(clerkUserId, { firstName, lastName });
    return true;
  } catch {
    return false;
  }
}

/**
 * The first name the header greets with, or null when neither Clerk nor the
 * profile has one — the header then asks for it. Cached per request.
 */
export const greetingName = cache(async (clerkUserId: string): Promise<string | null> => {
  const user = await currentUser();
  const first = user?.firstName?.trim();
  if (first) return first;

  const fromProfile = await profileName(clerkUserId);
  if (!fromProfile) return null;
  return (await fillClerkNameIfBlank(clerkUserId, fromProfile)) ?? splitName(fromProfile).firstName;
});

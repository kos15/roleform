import "server-only";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { currentRole } from "./role";

/**
 * The admin section exists only for admins.
 *
 * Anyone else — signed out, or a signed-in member — gets the ordinary 404,
 * indistinguishable from a URL that was never there. No 403, no "ask an admin"
 * screen, no redirect to sign-in: each of those confirms the section exists.
 * Every admin route calls this before it renders or reads anything, and every
 * admin server action is separately gated by `requireAdmin` (app/actions/admin.ts),
 * so a hidden link is never the only lock.
 *
 * Returns the admin's Clerk subject.
 */
export async function assertAdminOr404(): Promise<string> {
  const { userId } = await auth();
  if (!userId) notFound();
  if ((await currentRole(userId)) !== "admin") notFound();
  return userId;
}

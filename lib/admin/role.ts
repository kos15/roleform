import "server-only";
import { clerkClient, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

/**
 * Who holds the admin role (F15).
 *
 * **Clerk's `publicMetadata.role` is the source of truth.** It is set in the
 * Clerk dashboard, which is where the people who grant permissions already
 * work, and it means the privileged bit lives with the identity rather than
 * beside the usage counters. `users.role` is a mirror, not a second opinion —
 * kept in step so that queries which need to reason about roles in SQL still
 * can, and never written by anything except this module.
 *
 * Organisations are not enabled on this instance, so there is one role per
 * person rather than one per membership. When organisations arrive this reads
 * `orgRole` instead and everything downstream is unchanged.
 */

export type Role = "member" | "admin";

export function roleFromMetadata(metadata: unknown): Role {
  if (metadata && typeof metadata === "object" && "role" in metadata) {
    return (metadata as { role?: unknown }).role === "admin" ? "admin" : "member";
  }
  return "member";
}

/**
 * The signed-in person's role, with the mirror brought up to date.
 *
 * `currentUser()` is memoised per request by Clerk, so the pages and actions
 * that each call this once do not each pay for a directory fetch.
 */
export async function currentRole(clerkUserId: string): Promise<Role> {
  const user = await currentUser();
  const role = roleFromMetadata(user?.publicMetadata);
  await mirror(clerkUserId, role);
  return role;
}

/**
 * Write-behind, and deliberately best-effort. A failed mirror must never turn
 * into a failed page: the answer we return came from the source of truth, and
 * the column exists to make SQL convenient, not to decide anything.
 */
async function mirror(clerkUserId: string, role: Role): Promise<void> {
  try {
    await db.user.updateMany({
      where: { clerkUserId, role: { not: role } },
      data: { role },
    });
  } catch {
    // N7: nothing about this failure is worth a log entry that carries a subject.
  }
}

/**
 * Everyone holding the role, read from Clerk rather than from the mirror.
 *
 * The mirror only refreshes when a person visits, so an admin who has been
 * granted the role but hasn't signed in since would be missing from a SQL
 * query — and this list is what a 403 points at. Being wrong there is exactly
 * the failure the 403 exists to prevent.
 */
export async function listAdmins(): Promise<{ name: string; initials: string }[]> {
  try {
    const client = await clerkClient();
    const list = await client.users.getUserList({ limit: 500 });
    return list.data
      .filter((u) => roleFromMetadata(u.publicMetadata) === "admin")
      .map((u) => {
        const name =
          [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "An admin";
        return { name, initials: initialsOf(name) };
      });
  } catch {
    return [];
  }
}

export function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

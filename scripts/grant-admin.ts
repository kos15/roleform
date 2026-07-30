import "./env";
import { createClerkClient } from "@clerk/backend";
import { db } from "../lib/db";

/**
 * Grant or revoke the admin role from a terminal.
 *
 * The role lives in Clerk's `publicMetadata` (lib/admin/role.ts), which means
 * the Clerk dashboard is the normal way to set it — this script exists for the
 * cases the dashboard is awkward for: scripting a new environment, or fixing
 * an instance you can only reach over ssh.
 *
 * It writes the source of truth and then nudges our mirror, so the change is
 * visible on the next page view rather than the next sign-in.
 *
 *   pnpm grant:admin user_2abc…
 *   pnpm grant:admin user_2abc… --revoke
 *
 * The argument is a Clerk subject. We store a hash of the address (N7), so
 * there is deliberately no way to look someone up by email here — read the id
 * off the Clerk dashboard or the admin panel's member list.
 */
async function main() {
  const [clerkUserId, flag] = process.argv.slice(2);

  if (!clerkUserId) {
    console.error("usage: pnpm grant:admin <clerk_user_id> [--revoke]");
    process.exit(1);
  }

  const role = flag === "--revoke" ? "member" : "admin";
  const clerk = createClerkClient({ secretKey: requireSecret() });

  const user = await clerk.users.getUser(clerkUserId).catch(() => null);
  if (!user) {
    console.error(`No Clerk user ${clerkUserId} on this instance.`);
    process.exit(1);
  }

  // Deliberately not importing roleFromMetadata: lib/admin/role.ts is
  // `server-only` and pulls in Next's request context, which a plain tsx
  // script has none of. One line duplicated beats a module that has to
  // pretend it runs in two places.
  const before = user.publicMetadata?.role === "admin" ? "admin" : "member";
  if (before === role) {
    console.log(`${clerkUserId} is already ${role}. Nothing to do.`);
    return;
  }

  // Merge rather than replace: publicMetadata is shared, and clobbering
  // somebody else's key to set ours would be a rude way to fix a permission.
  await clerk.users.updateUserMetadata(clerkUserId, {
    publicMetadata: { ...user.publicMetadata, role },
  });

  // Best-effort, same as the request-path mirror. The source of truth is
  // already correct; this only saves one page view of staleness.
  await db.user.updateMany({ where: { clerkUserId }, data: { role } }).catch(() => {});

  console.log(`${clerkUserId}: ${before} → ${role}`);
}

function requireSecret(): string {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) {
    console.error("CLERK_SECRET_KEY is not set. Add it to .env.local.");
    process.exit(1);
  }
  return key;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

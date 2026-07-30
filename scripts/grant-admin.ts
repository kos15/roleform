import "./env";
import { db } from "../lib/db";

/**
 * Bootstrap the first admin (F15).
 *
 * `users.role` defaults to `member`, and the only surface that can change a
 * role is behind the admin permission — so a fresh install has nobody who can
 * ever grant it. That is the correct default (an account that silently becomes
 * privileged is worse), and this script is the deliberate way out of it.
 *
 * Runs over the Prisma connection, which bypasses RLS by design (CLAUDE.md §7:
 * admin scripts are a trusted server path). It is not reachable from the app.
 *
 *   pnpm script scripts/grant-admin.ts user_2abc…
 *   pnpm script scripts/grant-admin.ts user_2abc… --revoke
 *
 * The argument is a Clerk subject, which you can read off the admin panel's
 * member list or the Clerk dashboard. We store a hash of the address (N7), so
 * there is deliberately no way to look someone up by email here.
 */
async function main() {
  const [clerkUserId, flag] = process.argv.slice(2);

  if (!clerkUserId) {
    console.error("usage: pnpm script scripts/grant-admin.ts <clerk_user_id> [--revoke]");
    process.exit(1);
  }

  const role = flag === "--revoke" ? "member" : "admin";

  const existing = await db.user.findUnique({
    where: { clerkUserId },
    select: { role: true },
  });

  if (!existing) {
    console.error(
      `No account row for ${clerkUserId}. The row is created on first use — sign in once, then run this again.`,
    );
    process.exit(1);
  }

  if (existing.role === role) {
    console.log(`${clerkUserId} is already ${role}. Nothing to do.`);
    return;
  }

  await db.user.update({ where: { clerkUserId }, data: { role } });
  console.log(`${clerkUserId}: ${existing.role} → ${role}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

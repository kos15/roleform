import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { cycleCounts } from "@/lib/db/queries/usage";
import { currentRole, initialsOf } from "@/lib/admin/role";
import { greetingName } from "@/lib/services/account/name";

/**
 * The account row at the top of the mobile sheet.
 *
 * It exists because the header drops the name chip and the role at this width,
 * and "which account am I in, and how much is left" is the first thing a person
 * checks when they open a menu on a phone. Server component so the counts are
 * read on the server and only a sentence reaches the client.
 *
 * Suspended by the caller — a layout that awaits this holds the first paint of
 * every page behind a Clerk read plus two queries.
 */
export async function SheetAccount() {
  const { userId } = await auth();
  if (!userId) return null;

  const [user, role, account] = await Promise.all([
    currentUser(),
    currentRole(userId),
    cycleCounts(userId),
  ]);

  // F33: the profile's name fills a blank account name (greetingName), so a
  // member who signed up with only an email still gets called something.
  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    (await greetingName(userId)) ||
    user?.username ||
    "Add your name";

  const roleLabel = role === "admin" ? "Admin" : "Member";
  // Counts-only pricing: the analyses left (plan + packs), never tokens.
  const analysesLeft =
    account && account.analyses.left !== null ? account.analyses.left + account.analyses.bonusLeft : null;
  const line =
    analysesLeft === null
      ? roleLabel
      : `${roleLabel} · ${analysesLeft} ${analysesLeft === 1 ? "analysis" : "analyses"} left`;

  return (
    <div className="mb-3.5 flex items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--color-bg-tint)] px-3.5 py-3">
      <div className="grid h-10 w-10 flex-none place-items-center rounded-[var(--radius-pill)] bg-[var(--color-sage-500)] text-[13px] font-extrabold text-[var(--color-text)]">
        {initialsOf(name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate display text-[19px] uppercase leading-tight">
          {name}
        </div>
        <div className="truncate text-xs text-[var(--color-text-muted)]">{line}</div>
      </div>
      <Link href="/profile" className="btn btn-secondary btn-sm flex-none no-underline">
        Open
      </Link>
    </div>
  );
}

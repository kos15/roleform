import { auth } from "@clerk/nextjs/server";
import { greetingName } from "@/lib/account/name";
import { NameRequiredDialog } from "@/components/name-required-dialog";

/**
 * Every account has a name (F33.1). Without one the admin list can only show
 * an address fragment, and two members who signed up by email code read as
 * the same blank row.
 *
 * A sibling of the page rather than a wrapper around it: the page renders in
 * parallel and the dialog sits over it, so nobody with a name waits on this
 * Clerk read before the first paint. `greetingName` fills a blank Clerk name
 * from the profile first, so a member whose résumé already carries a name is
 * never asked.
 */
export async function NameGate() {
  const { userId } = await auth();
  if (!userId) return null;
  const first = await greetingName(userId);
  return first ? null : <NameRequiredDialog />;
}

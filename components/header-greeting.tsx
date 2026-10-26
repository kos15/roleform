import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { greetingName } from "@/lib/services/account/name";

/**
 * "Hi, Asha" beside the account button (F33) — or, when we have no name for
 * them anywhere, a nudge to add one on their profile. Suspended by the caller:
 * it waits on a Clerk read and, at most once, a profile read.
 */
export async function HeaderGreeting() {
  const { userId } = await auth();
  if (!userId) return null;
  const first = await greetingName(userId);

  if (!first) {
    return (
      <Link
        href="/profile#your-name"
        className="tag tag-outline wide-only no-underline"
        title="We don't have your name yet"
      >
        Add your name
      </Link>
    );
  }

  return (
    <Link
      href="/profile#your-name"
      className="wide-only max-w-[16ch] truncate text-base font-extrabold text-[var(--color-text)] no-underline"
    >
      Hi, {first}
    </Link>
  );
}

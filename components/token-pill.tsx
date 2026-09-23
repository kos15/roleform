import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { accountTokens } from "@/lib/db/queries/tokens";
import { formatCount, formatResetDate, formatTokens } from "@/lib/domain/tokens";

/**
 * The balance, in the header (F19).
 *
 * The meter is visible before it matters, which is the entire point. A member
 * who first learns about the allowance from the dialog that refused their run
 * has been surprised by it; one who has watched a ring close over three weeks
 * has not. It is a link to the profile rather than a button that opens the
 * wall — the wall is a refusal, and nothing should be able to summon one.
 *
 * Server component: the balance is two aggregate queries, and putting it in a
 * client component would mean shipping an endpoint that reports what someone's
 * account has spent. It is rendered inside a Suspense boundary in the layout
 * for the same reason the role chip is — a layout that awaits holds the first
 * paint of every page behind a query.
 */
export async function TokenPill() {
  const { userId } = await auth();
  if (!userId) return null;

  const account = await accountTokens(userId);
  if (!account) return null;

  const { balance } = account;

  // The ring is a 44-unit circumference (2πr, r = 7), drawn from the top.
  const dash = `${(balance.fraction * 44).toFixed(1)} 44`;

  return (
    <Link
      href="/profile"
      data-tour="tokens"
      title={`${formatCount(balance.left)} tokens left of ${formatCount(balance.total)} · resets ${formatResetDate(account.resetsAt)}`}
      className="flex h-[38px] flex-none items-center gap-2 rounded-[var(--radius-pill)] border-[1.5px] pl-[9px] pr-3.5 no-underline transition-colors"
      style={{
        // Pink only when it is nearly gone, and it stays pink from then on.
        // A pill that changed colour every few runs would be chrome that cries
        // wolf; this one changes once, at the point it is worth reading.
        borderColor: "var(--color-text)",
        background: balance.low ? "var(--color-sage-200)" : "transparent",
      }}
    >
      <svg width="19" height="19" viewBox="0 0 18 18" aria-hidden className="flex-none">
        <circle cx="9" cy="9" r="7" fill="none" stroke="var(--color-line)" strokeWidth="3" />
        <circle
          cx="9"
          cy="9"
          r="7"
          fill="none"
          stroke={balance.low ? "var(--color-sage-600)" : "var(--color-accent-600)"}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={dash}
          transform="rotate(-90 9 9)"
        />
      </svg>
      <span className="text-[13px] font-extrabold tabular-nums">{formatTokens(balance.left)}</span>
      <span className="hidden text-[13px] text-[var(--color-text-muted)] sm:inline">left</span>
    </Link>
  );
}

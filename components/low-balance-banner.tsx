import { auth } from "@clerk/nextjs/server";
import { accountTokens } from "@/lib/db/queries/tokens";
import { formatResetDate } from "@/lib/domain/tokens";
import { LowBalanceNotice } from "@/components/low-balance-notice";

/**
 * Decides whether the one-time warning is warranted; the client half decides
 * whether it has already been shown (F19).
 *
 * Split that way so the balance never reaches the browser as data. The banner
 * renders or it doesn't, and the client component is handed three values it
 * needs to write a sentence — never the account's usage.
 *
 * `accountTokens` is request-memoised, so this shares the header pill's queries
 * rather than doubling them.
 */
export async function LowBalanceBanner() {
  const { userId } = await auth();
  if (!userId) return null;

  const account = await accountTokens(userId);
  // A suspended account is not a low account, and offering it the profile's
  // "what you've drawn" page would be answering a question it isn't asking.
  if (!account || account.suspended || !account.balance.low) return null;

  return (
    <LowBalanceNotice
      runsLeft={account.balance.runsLeft}
      resetDate={formatResetDate(account.resetsAt)}
      empty={account.balance.empty}
    />
  );
}

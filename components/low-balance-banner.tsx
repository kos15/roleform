import { auth } from "@clerk/nextjs/server";
import { cycleCounts } from "@/lib/db/queries/usage";
import { formatResetDate } from "@/lib/domain/tokens";
import { lowCountNotice } from "@/lib/domain/quotas";
import { LowBalanceNotice } from "@/components/low-balance-notice";

/**
 * Decides whether the once-a-cycle low-count warning is warranted; the client
 * half decides whether it has already been shown (F19, counts-only pricing).
 *
 * Speaks in the counts the pricing page prints — analyses, answers, practice
 * sessions — never tokens. Unspent extra analyses count as analyses left. The
 * client is handed a sentence and a date, never the account's usage.
 */
export async function LowBalanceBanner() {
  const { userId } = await auth();
  if (!userId) return null;

  const counts = await cycleCounts(userId);
  // A suspended account is not a low account.
  if (!counts || counts.suspended) return null;

  // A count of zero on the plan is Off, not "used up" — never warn about it.
  const left = (line: { cap: number | null; left: number | null }, extra = 0) =>
    line.cap === 0 && extra === 0 ? null : line.left === null ? null : line.left + extra;
  const notice = lowCountNotice({
    analyses: left(counts.analyses, counts.analyses.bonusLeft),
    answers: left(counts.answers),
    practice: left(counts.practice),
  });
  if (!notice) return null;

  return (
    <LowBalanceNotice
      noticeKey={notice.key}
      text={notice.text}
      resetDate={formatResetDate(counts.resetsAt)}
      empty={notice.empty}
    />
  );
}

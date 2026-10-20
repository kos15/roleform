/**
 * One-off: unspent token top-ups → extra analyses (counts-only pricing,
 * docs/superpowers/specs/2026-10-21-pricing-without-tokens-design.md §5.3).
 *
 * Members paid for tokens; tokens are no longer something a member sees, so
 * whatever they have not spent becomes extra analyses — at the run estimate in
 * force when they bought them, rounded UP. The token grants themselves stay:
 * they only lift the hidden fair-use ceiling now, so keeping them is the
 * generous direction and nothing anyone paid for is ever taken away.
 *
 * Idempotent: one grant per member, `reference = conv:<clerk id>` (unique).
 * A second run finds the reference and skips. Prints counts only (N7).
 *
 *   pnpm topups:convert            dry run — what would be granted
 *   pnpm topups:convert --apply    write the grants
 */
import "./env";
import { db } from "../lib/db";
import { grantedTokens, unspentTopups, usageByCycle } from "../lib/db/queries/tokens";
import { PRE_CHANGE_ALLOWANCE, convertedAnalyses } from "../lib/domain/entitlements";
import { cycleStart } from "../lib/domain/quotas";

/** RUN_ESTIMATE before counts-only pricing (lib/domain/tokens.ts, 2026-10-21). Frozen on purpose. */
const PRE_CHANGE_RUN_ESTIMATE = 20_000;

async function main() {
  const apply = process.argv.includes("--apply");
  const holders = await db.tokenGrant.groupBy({ by: ["clerkUserId"] });
  let members = 0;
  let analyses = 0;
  let skipped = 0;

  for (const { clerkUserId } of holders) {
    const reference = `conv:${clerkUserId}`;
    if (await db.analysisGrant.findUnique({ where: { reference } })) {
      skipped++;
      continue;
    }
    // Measured here rather than through accountTokens: that now reads the
    // RAISED cap_tokens (which would forgive every past overrun) and adds the
    // headroom of any new pack (which would convert analyses into more
    // analyses). Overruns are judged against the allowance the member had
    // when they spent them.
    const user = await db.user.findUnique({ where: { clerkUserId }, select: { plan: true, quotaResetsAt: true } });
    if (!user) continue;
    const [usage, granted] = await Promise.all([
      usageByCycle(clerkUserId, cycleStart(user.quotaResetsAt)),
      grantedTokens(clerkUserId),
    ]);
    const unspent = unspentTopups(granted, usage, PRE_CHANGE_ALLOWANCE[user.plan]);
    const extra = convertedAnalyses(unspent, PRE_CHANGE_RUN_ESTIMATE);
    if (extra === 0) continue;
    members++;
    analyses += extra;
    if (apply) {
      await db.analysisGrant.create({ data: { clerkUserId, analyses: extra, source: "token_conversion", reference } });
    }
  }

  console.log(`${apply ? "Granted" : "Would grant"} ${analyses} extra analyses to ${members} member(s); ${skipped} already converted.`);
  if (!apply) console.log("Dry run. Re-run with --apply to write the grants.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

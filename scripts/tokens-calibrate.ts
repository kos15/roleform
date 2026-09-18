/**
 * Token calibration (F24 §5.5).
 *
 * `lib/domain/tokens.ts#TOKEN_STAGES` and the pricing page's "about N tokens"
 * are hand-typed numbers with nothing that keeps them honest against what a
 * run actually costs (G11). This prints the measured p50/p95 per purpose from
 * `ai_runs` over the last 30 days, so an admin can re-type the constant from a
 * real number rather than a guess — and so a prompt-diet change (F24) has
 * something to show its delta against.
 *
 * Read-only. Nothing here writes a row or calls a model.
 *
 *   pnpm tokens:calibrate
 */
import "./env";
import { db } from "../lib/db";
import { RUN_ESTIMATE, TOKEN_STAGES } from "../lib/domain/tokens";

const WINDOW_DAYS = 30;

async function main() {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  const rows = await db.aiRun.findMany({
    where: { createdAt: { gte: since }, schemaValid: true },
    select: { purpose: true, promptVersion: true, inputTokens: true, outputTokens: true },
  });

  if (rows.length === 0) {
    console.log(`No schema-valid ai_runs in the last ${WINDOW_DAYS} days. Nothing to calibrate.`);
    return;
  }

  const byPurpose = new Map<string, number[]>();
  for (const row of rows) {
    const total = row.inputTokens + row.outputTokens;
    const key = `${row.purpose} (${row.promptVersion})`;
    byPurpose.set(key, [...(byPurpose.get(key) ?? []), total]);
  }

  console.log(`\nToken calibration — last ${WINDOW_DAYS} days, ${rows.length} schema-valid calls\n`);
  console.log(`${"purpose (version)".padEnd(34)} n      p50      p95`);
  console.log("-".repeat(64));

  for (const [key, values] of [...byPurpose.entries()].sort()) {
    const sorted = [...values].sort((a, b) => a - b);
    const p50 = percentile(sorted, 0.5);
    const p95 = percentile(sorted, 0.95);
    console.log(`${key.padEnd(34)} ${String(sorted.length).padEnd(6)} ${String(p50).padEnd(8)} ${p95}`);
  }

  console.log("\nCurrent TOKEN_STAGES (lib/domain/tokens.ts):");
  for (const s of TOKEN_STAGES) console.log(`  ${s.stage.padEnd(34)} ${s.estimate}`);
  console.log(`  ${"RUN_ESTIMATE".padEnd(34)} ${RUN_ESTIMATE}`);

  console.log(
    "\nNote: tailor_bullet fires once per bullet (~15-30x a run), not once — sum its p50 by",
    "the bullet count on a representative profile before comparing to RUN_ESTIMATE by hand.",
    "This script reports per-CALL cost; a human re-derives per-RUN cost from it, same as the",
    "spec's own instruction (F24 §5.5): edited by hand from this output, not auto-applied.",
  );
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

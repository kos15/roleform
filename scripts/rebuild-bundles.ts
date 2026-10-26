/**
 * The bundle builder, as a command — RLE spec §7, rag-strategy.md §7.
 *
 * This is where the learning engine's cost model is actually paid. Everything
 * expensive about retrieval happens HERE, once per (skill, level) pair, off the
 * request path, and is then read by every user forever for the price of a
 * primary-key lookup.
 *
 * ```
 *   STANDARD RAG                    RLE
 *   ─────────────────────────       ─────────────────────────────────────────
 *   per request: embed, search,     per request: SELECT … FROM skill_bundles
 *   rerank, stuff passages, gen     this script: search, rank, diversify, freeze
 * ```
 *
 * Run it after `pnpm seed:catalog`, and again whenever the catalog changes.
 * NEVER on a user request — that is invariant I1.
 *
 * The logic lives in `lib/learning/rebuild-bundles.ts` (I/O) and
 * `lib/domain/bundle-rank.ts` (pure ranking); this file only reports.
 */
import "./env";
import { db } from "../lib/db";
import { rebuildBundles } from "../lib/learning/rebuild-bundles";

const LEVELS = 3;

async function main() {
  const { written, empty, skills } = await rebuildBundles();
  const coverage = written / (skills * LEVELS);
  console.log(`bundles written: ${written}`);
  console.log(`empty (skill, level) pairs: ${empty}`);
  console.log(`bundle coverage: ${Math.round(coverage * 100)}%`);
  if (coverage < 0.8) {
    // rag-strategy.md §11's leading indicator. Below 80% users start hitting
    // roadmap fallbacks, which is the corpus telling you what to index next.
    console.log(
      `\ncoverage is under the 80% target — read corpus_gaps ranked by demand;\n` +
        `that table IS the ingestion backlog.`,
    );
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

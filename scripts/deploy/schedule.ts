/**
 * `pnpm deploy:schedule` — the production build's pg_cron install (N25). The
 * gate runs first; only then is the worker imported. Skipped with one line
 * outside production. A failure exits 1 and fails the deploy.
 * No top-level await: the scripts tsconfig is CommonJS.
 */
import { isProductionBuild, skipLine } from "./gate";

async function main(): Promise<number> {
  if (!isProductionBuild()) {
    console.log(skipLine("schedule"));
    return 0;
  }
  const { deploySchedule } = await import("../db/install-schedule");
  await deploySchedule();
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`[deploy:schedule] failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);

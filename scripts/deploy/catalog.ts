/**
 * `pnpm deploy:catalog` — the production build's catalog sync (N25). The gate
 * runs first; only then is the worker (which loads lib/db) imported. Skipped
 * with one line outside production. A failure exits 1 and fails the deploy.
 * No top-level await: the scripts tsconfig is CommonJS.
 */
import { isProductionBuild, skipLine } from "./gate";

async function main(): Promise<number> {
  if (!isProductionBuild()) {
    console.log(skipLine("catalog"));
    return 0;
  }
  const { runCatalogDeploy } = await import("./catalog-store");
  return runCatalogDeploy();
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`[deploy:catalog] failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);

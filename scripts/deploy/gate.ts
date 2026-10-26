/**
 * The production gate for build-time steps (N25). Deliberately has NO imports:
 * it must never pull in `../env`, which loads .env.local, and
 * `vercel env pull --environment=production` writes VERCEL_ENV=production into
 * that file, so a local run would otherwise pass the gate and write to the
 * production database.
 */
export function isProductionBuild(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return env.VERCEL_ENV === "production";
}

export function skipLine(name: "catalog" | "schedule", env: Partial<NodeJS.ProcessEnv> = process.env): string {
  return `[deploy:${name}] skipped (VERCEL_ENV=${env.VERCEL_ENV || "unset"})`;
}

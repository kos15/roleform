/**
 * The pg_cron install, shared by the manual `pnpm db:schedule` and the build's
 * `pnpm deploy:schedule` (N25). Deliberately NO `../env` import: the deploy
 * path must never load .env.local (Ruling 9). Callers pass the connection.
 */
import postgres from "postgres";
import { CRON_JOBS, CRON_SECRET_NAME, scheduleCommand } from "../../lib/services/cron";

export function scheduleTarget(appUrl: string | undefined, secret: string | undefined): { appUrl: string; secret: string } {
  const origin = (appUrl ?? "").replace(/\/+$/, "");
  const token = secret ?? "";
  if (!/^https:\/\//.test(origin)) throw new Error("APP_URL must be the deployment's https:// origin");
  if (token.length < 32) throw new Error("CRON_SECRET must be set, and at least 32 characters");
  return { appUrl: origin, secret: token };
}

export async function installSchedule(sql: postgres.Sql, appUrl: string, secret: string): Promise<string[]> {
  const lines: string[] = [];
  await sql`create extension if not exists pg_cron`;
  await sql`create extension if not exists pg_net`;

  // Vault: update in place when it exists, so a rotation leaves one secret.
  const [existing] = await sql<{ id: string }[]>`select id from vault.secrets where name = ${CRON_SECRET_NAME}`;
  if (existing) await sql`select vault.update_secret(${existing.id}::uuid, ${secret})`;
  else await sql`select vault.create_secret(${secret}, ${CRON_SECRET_NAME}, 'Bearer token for /api/cron/* (N24)')`;

  for (const job of CRON_JOBS) {
    await sql`select cron.unschedule(jobid) from cron.job where jobname = ${job.name}`;
    await sql`select cron.schedule(${job.name}, ${job.schedule}, ${scheduleCommand(job, appUrl)})`;
    lines.push(`scheduled ${job.name}: ${job.schedule} → ${appUrl}${job.path}`);
  }
  return lines;
}

/** Build-time install: APP_URL only (no fallback), validated before any connection. */
export async function deploySchedule(
  env: Partial<NodeJS.ProcessEnv> = process.env,
  connect: (url: string) => postgres.Sql = (u) => postgres(u, { max: 1 }),
): Promise<void> {
  const url = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL (or DATABASE_URL) is not set");
  const { appUrl, secret } = scheduleTarget(env.APP_URL, env.CRON_SECRET);
  console.log(`[deploy:schedule] target ${appUrl}`);
  const sql = connect(url);
  try {
    const lines = await installSchedule(sql, appUrl, secret);
    lines.forEach((l) => console.log(`[deploy:schedule] ${l}`));
  } finally {
    await sql.end();
  }
}

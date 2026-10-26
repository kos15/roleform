/**
 * Schedules every job in CRON_JOBS (lib/services/cron.ts, N24) in Supabase:
 * pg_cron calls `GET {APP_URL}{job.path}` on the job's schedule through
 * pg_net, with `Authorization: Bearer {CRON_SECRET}`. Today that is the F29
 * reminder sender (every five minutes) and the daily catalog link re-check.
 *
 * It keeps the original job name "roleform-round-reminders", so running it
 * over a database scheduled by the old script replaces that `cron.job` row.
 *
 * Why the database and not Vercel Cron: on Vercel's Hobby plan a cron job may
 * run at most once a day, and "your interview is in an hour" cannot be sent
 * by a once-a-day job. Supabase's pg_cron runs every minute on every plan and
 * is already in the stack (CLAUDE.md §6) — no new vendor, no new bill. On a
 * Vercel plan with sub-daily crons, `vercel.json` can call the same route
 * instead; the route accepts either, and the sender's claim makes two
 * schedulers safe, if wasteful.
 *
 * The secret is kept in Supabase Vault, not in the cron job's command text,
 * so `select * from cron.job` never shows it. Re-running this script replaces
 * both the secret and the jobs, so rotating CRON_SECRET is: set the env var on
 * Vercel and locally, run `pnpm db:schedule`.
 *
 * Usage: APP_URL=https://roleform.koustubh.org pnpm db:schedule
 *        pnpm db:schedule --remove
 */
import "../env";
import postgres from "postgres";
import { CRON_JOBS, CRON_SECRET_NAME, scheduleCommand } from "../../lib/services/cron";

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL (or DATABASE_URL) is not set");
  const sql = postgres(url, { max: 1 });

  try {
    if (process.argv.includes("--remove")) {
      for (const job of CRON_JOBS) {
        await sql`select cron.unschedule(jobid) from cron.job where jobname = ${job.name}`;
        console.log(`unscheduled ${job.name}`);
      }
      return;
    }

    const appUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
    const secret = process.env.CRON_SECRET ?? "";
    if (!/^https:\/\//.test(appUrl)) throw new Error("APP_URL must be the deployment's https:// origin");
    if (secret.length < 32) throw new Error("CRON_SECRET must be set, and at least 32 characters");

    await sql`create extension if not exists pg_cron`;
    await sql`create extension if not exists pg_net`;

    // Vault: update in place when it exists, so a rotation leaves one secret.
    const [existing] = await sql<{ id: string }[]>`select id from vault.secrets where name = ${CRON_SECRET_NAME}`;
    if (existing) await sql`select vault.update_secret(${existing.id}::uuid, ${secret})`;
    else await sql`select vault.create_secret(${secret}, ${CRON_SECRET_NAME}, 'Bearer token for /api/cron/* (N24)')`;

    for (const job of CRON_JOBS) {
      await sql`select cron.unschedule(jobid) from cron.job where jobname = ${job.name}`;
      await sql`select cron.schedule(${job.name}, ${job.schedule}, ${scheduleCommand(job, appUrl)})`;
      console.log(`scheduled ${job.name}: ${job.schedule} → ${appUrl}${job.path}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

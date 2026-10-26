import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Scheduled work is a closed list (N24). A new entry needs a route, a
 * middleware line, and a reason it cannot be settled on read.
 */
export interface CronJob {
  name: string;
  path: `/api/cron/${string}`;
  schedule: string;
  timeoutMs: number;
}

export const CRON_JOBS: readonly CronJob[] = [
  { name: "roleform-round-reminders", path: "/api/cron/reminders", schedule: "*/5 * * * *", timeoutMs: 55_000 },
  { name: "roleform-catalog-refresh", path: "/api/cron/catalog", schedule: "17 3 * * *", timeoutMs: 290_000 },
];

export function cronAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Vault secret holding CRON_SECRET; the scheduled command reads it at run time. */
export const CRON_SECRET_NAME = "roleform_cron_secret";

/**
 * The pg_cron command for one job. Only the URL is interpolated (single
 * quotes doubled); the secret is read from Vault when the job fires.
 */
export function scheduleCommand(job: CronJob, appUrl: string): string {
  const endpoint = `${appUrl}${job.path}`.replace(/'/g, "''");
  return `
      select net.http_get(
        url := '${endpoint}',
        headers := jsonb_build_object(
          'Authorization',
          'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '${CRON_SECRET_NAME}')
        ),
        timeout_milliseconds := ${job.timeoutMs}
      );`;
}

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
];

export function cronAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

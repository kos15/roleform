import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";

/** F29 read path. Scoped by subject on every query; RLS is the second lock. */

export async function getRounds(clerkUserId: string, analysisId: string) {
  return db.interviewRound.findMany({
    where: { clerkUserId, analysisId },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      label: true,
      kind: true,
      scheduledAt: true,
      timeZone: true,
      notes: true,
      status: true,
      leads: true,
      reminders: { select: { lead: true, status: true, dueAt: true }, orderBy: { dueAt: "asc" } },
    },
  });
}

export type RoundRow = Awaited<ReturnType<typeof getRounds>>[number];

/**
 * A short fingerprint of a push endpoint. The endpoint itself is a capability
 * URL — anyone holding it can address that device — so it never goes back to
 * the browser. The page hashes its own endpoint the same way to find "this
 * device" in the list.
 */
export function endpointKey(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 16);
}

export async function getDevices(clerkUserId: string) {
  const rows = await db.pushSubscription.findMany({
    where: { clerkUserId },
    orderBy: { createdAt: "desc" },
    select: { id: true, endpoint: true, deviceLabel: true, createdAt: true, lastSentAt: true },
  });
  return rows.map(({ endpoint, ...row }) => ({ ...row, key: endpointKey(endpoint) }));
}

export type DeviceRow = Awaited<ReturnType<typeof getDevices>>[number];

/**
 * The next round still ahead on this posting — for the "Preparing for" strip
 * on the prep surfaces (F29.1).
 */
export async function getNextRound(clerkUserId: string, analysisId: string) {
  return db.interviewRound.findFirst({
    where: { clerkUserId, analysisId, status: "upcoming", scheduledAt: { gt: new Date() } },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, label: true, kind: true, scheduledAt: true, timeZone: true },
  });
}

/** Every round still ahead, across postings — the History page's list (F29.1). */
export async function getUpcomingRounds(clerkUserId: string, take = 6) {
  return db.interviewRound.findMany({
    where: { clerkUserId, status: "upcoming", scheduledAt: { gt: new Date() } },
    orderBy: { scheduledAt: "asc" },
    take,
    select: {
      id: true,
      analysisId: true,
      label: true,
      kind: true,
      scheduledAt: true,
      timeZone: true,
      analysis: { select: { company: true, title: true } },
    },
  });
}

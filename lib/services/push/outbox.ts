import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  LEASE_MS,
  MAX_ATTEMPTS,
  PushPayloadSchema,
  categoryAllowed,
  classify,
  emptySummary,
  nextAttempt,
  topicFor,
  ttlSeconds,
  type NotifyPrefs,
  type OutboxSummary,
  type PushCategory,
  type PushPayload,
} from "@/lib/domain/push";
import { pushConfigured, pushOnce } from "./send";

/**
 * The push outbox (F29.2) — durable, retried, deduplicated delivery.
 *
 * `enqueue` is what a business event calls: it checks the member's
 * preferences, fans the push out to every enabled device as one
 * `push_deliveries` row each, and returns. Nothing is sent inline, so a slow
 * push service never holds up the event, and a crash between the two halves
 * loses nothing — the row is still queued.
 *
 * `processOutbox` is the sender. It LEASES due rows with one
 * `UPDATE … FOR UPDATE SKIP LOCKED`, so overlapping cron calls never take the
 * same row; a sender that dies mid-batch leaves its lease to lapse and the row
 * is picked up again (bounded by MAX_ATTEMPTS, CHECKed). Each answer is
 * classified by lib/domain/push.ts:
 *
 *   201        → accepted (by the push service — not "delivered", not "read")
 *   404 / 410  → gone: the device row is deleted
 *   429 / 5xx / timeout → queued again with backoff, unless the TTL runs out
 *   anything else → failed
 *
 * Logs are counts and status codes (N7). Never an endpoint, a title or a body.
 */

/** The DB CHECK and MAX_ATTEMPTS must agree; this fails the build if not. */
const _attemptsCap: 5 = MAX_ATTEMPTS;
void _attemptsCap;

// Chunks of 50 in parallel, each send capped at 10s: a 200-row pass stays
// inside 40s even when every push service is slow (route budget 60s).
const CHUNK = 50;

export interface EnqueueInput {
  clerkUserId: string;
  category: PushCategory;
  /** Unique per event: "round:<id>", "study:<id>", "test:<uuid>". */
  dedupeKey: string;
  /** Built from the member's prefs — the discreet copy unless they chose details. */
  payload: (prefs: NotifyPrefs) => PushPayload;
  /** After this the push is worthless and is never sent. */
  expiresAt: Date;
  /** Hold the first attempt until then (the "test with the app closed" delay). */
  notBefore?: Date;
}

export interface EnqueueResult {
  /** Enabled devices the member has. */
  devices: number;
  /** Rows newly queued (a duplicate event queues nothing). */
  queued: number;
  /** Why nothing was queued, when nothing was. */
  reason: "ok" | "unconfigured" | "category_off" | "no_devices";
}

export async function enqueue(input: EnqueueInput): Promise<EnqueueResult> {
  if (!pushConfigured()) return { devices: 0, queued: 0, reason: "unconfigured" };

  const user = await db.user.findUnique({
    where: { clerkUserId: input.clerkUserId },
    select: {
      notifyRounds: true,
      notifyStudy: true,
      notifyDetails: true,
      pushSubscriptions: { where: { enabled: true }, select: { id: true } },
    },
  });
  if (!user) return { devices: 0, queued: 0, reason: "no_devices" };
  if (!categoryAllowed(input.category, user)) return { devices: 0, queued: 0, reason: "category_off" };
  const devices = user.pushSubscriptions;
  if (devices.length === 0) return { devices: 0, queued: 0, reason: "no_devices" };

  // A malformed payload is a caller bug: refuse it loudly rather than send it.
  const payload = PushPayloadSchema.parse(input.payload(user));

  const created = await db.pushDelivery.createMany({
    data: devices.map((d) => ({
      clerkUserId: input.clerkUserId,
      subscriptionId: d.id,
      category: input.category,
      dedupeKey: input.dedupeKey,
      ...payload,
      expiresAt: input.expiresAt,
      nextAttemptAt: input.notBefore ?? new Date(),
    })),
    skipDuplicates: true,
  });
  return { devices: devices.length, queued: created.count, reason: "ok" };
}

interface LeasedRow {
  id: string;
  clerk_user_id: string;
  subscription_id: string | null;
  category: PushCategory;
  title: string;
  body: string;
  url: string;
  tag: string;
  attempts: number;
  expires_at: Date;
}

/** Takes up to `limit` due rows for this sender. */
async function lease(limit: number, clerkUserId: string | undefined, now: Date): Promise<LeasedRow[]> {
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const member = clerkUserId ? Prisma.sql`AND clerk_user_id = ${clerkUserId}` : Prisma.empty;

  // A lapsed lease on a row already at its last attempt can't be retried —
  // settle it first, so the lease below never pushes attempts past the CHECK.
  await db.$executeRaw`
    UPDATE push_deliveries
       SET status = 'failed', lease_until = NULL, updated_at = ${now}
     WHERE status = 'sending' AND lease_until < ${now} AND attempts >= ${MAX_ATTEMPTS} ${member}`;

  return db.$queryRaw<LeasedRow[]>`
    UPDATE push_deliveries AS d
       SET status = 'sending', lease_until = ${leaseUntil}, attempts = d.attempts + 1, updated_at = ${now}
     WHERE d.id IN (
       SELECT id FROM push_deliveries
        WHERE attempts < ${MAX_ATTEMPTS}
          AND ((status = 'queued' AND next_attempt_at <= ${now})
            OR (status = 'sending' AND lease_until < ${now}))
          ${member}
        ORDER BY next_attempt_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
    RETURNING d.id, d.clerk_user_id, d.subscription_id, d.category, d.title, d.body, d.url, d.tag,
              d.attempts, d.expires_at`;
}

/**
 * Sends what is due. `clerkUserId` narrows it to one member (the test button
 * drains its own row at once instead of waiting for the cron). Returns counts.
 */
export async function processOutbox(
  opts: { limit?: number; clerkUserId?: string; now?: Date } = {},
): Promise<OutboxSummary> {
  const summary = emptySummary();
  if (!pushConfigured()) return summary;
  const now = opts.now ?? new Date();

  const rows = await lease(opts.limit ?? 100, opts.clerkUserId, now);
  summary.leased = rows.length;
  if (rows.length === 0) return summary;

  const subIds = [...new Set(rows.map((r) => r.subscription_id).filter((id): id is string => id !== null))];
  const memberIds = [...new Set(rows.map((r) => r.clerk_user_id))];
  const [subs, members] = await Promise.all([
    db.pushSubscription.findMany({
      where: { id: { in: subIds } },
      select: { id: true, clerkUserId: true, endpoint: true, p256dh: true, auth: true, enabled: true },
    }),
    db.user.findMany({
      where: { clerkUserId: { in: memberIds } },
      select: { clerkUserId: true, notifyRounds: true, notifyStudy: true, notifyDetails: true },
    }),
  ]);
  const subById = new Map(subs.map((s) => [s.id, s]));
  const prefsById = new Map(members.map((m) => [m.clerkUserId, m]));
  const codes = new Map<string, number>();

  const settle = (id: string, data: Prisma.PushDeliveryUpdateInput) =>
    db.pushDelivery.update({ where: { id }, data: { leaseUntil: null, ...data } });

  const handle = async (row: LeasedRow): Promise<void> => {
    const sub = row.subscription_id ? subById.get(row.subscription_id) : undefined;
    if (!sub) {
      summary.gone += 1;
      return void (await settle(row.id, { status: "gone" }));
    }
    // Re-checked at send time, not only at queue time: a device can be paused,
    // a category switched off, or the device handed to another account after
    // the row was queued.
    const prefs = prefsById.get(row.clerk_user_id);
    if (sub.clerkUserId !== row.clerk_user_id || !sub.enabled || !prefs || !categoryAllowed(row.category, prefs)) {
      summary.cancelled += 1;
      return void (await settle(row.id, { status: "cancelled" }));
    }
    const ttl = ttlSeconds(row.expires_at, now);
    if (ttl <= 0) {
      summary.expired += 1;
      return void (await settle(row.id, { status: "expired" }));
    }

    const attempt = await pushOnce(
      sub,
      { title: row.title, body: row.body, url: row.url, tag: row.tag },
      { ttlSeconds: ttl, urgency: row.category === "study" ? "normal" : "high", topic: topicFor(row.tag) },
    );
    const code = attempt.status === null ? "network" : String(attempt.status);
    codes.set(code, (codes.get(code) ?? 0) + 1);
    const outcome = classify(attempt.status, attempt.retryAfter);

    if (outcome.kind === "accepted") {
      summary.accepted += 1;
      await settle(row.id, { status: "accepted", acceptedAt: now, lastStatus: attempt.status });
      await db.pushSubscription.update({ where: { id: sub.id }, data: { lastSentAt: now } });
      return;
    }
    if (outcome.kind === "gone") {
      summary.gone += 1;
      await settle(row.id, { status: "gone", lastStatus: attempt.status });
      // The only way a dead endpoint leaves the table. Other queued rows for
      // it lose their device (SET NULL) and settle as gone on their turn.
      await db.pushSubscription.deleteMany({ where: { id: sub.id } });
      return;
    }
    if (outcome.kind === "retry") {
      const at = nextAttempt(row.attempts, outcome, row.expires_at, now);
      if (at) {
        summary.retrying += 1;
        return void (await settle(row.id, { status: "queued", nextAttemptAt: at, lastStatus: attempt.status }));
      }
      const expired = at === null && row.attempts < MAX_ATTEMPTS;
      if (expired) summary.expired += 1;
      else summary.failed += 1;
      return void (await settle(row.id, { status: expired ? "expired" : "failed", lastStatus: attempt.status }));
    }
    summary.failed += 1;
    await settle(row.id, { status: "failed", lastStatus: attempt.status });
  };

  for (let i = 0; i < rows.length; i += CHUNK) {
    await Promise.all(
      rows.slice(i, i + CHUNK).map((row) =>
        handle(row).catch(() => {
          // A DB hiccup settling one row leaves it leased; the lease lapses and
          // it is retried. Counted, never thrown — the batch carries on.
          summary.failed += 1;
        }),
      ),
    );
  }

  const byCode = [...codes].map(([c, n]) => `${c}:${n}`).join(",");
  console.info(
    `[push] leased=${summary.leased} accepted=${summary.accepted} retrying=${summary.retrying} ` +
      `failed=${summary.failed} expired=${summary.expired} gone=${summary.gone} cancelled=${summary.cancelled}` +
      (byCode ? ` codes=${byCode}` : ""),
  );
  return summary;
}

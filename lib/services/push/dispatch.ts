import "server-only";
import { db } from "@/lib/db";
import { discreetReminderCopy, reminderCopy, reminderPath, shouldSend } from "@/lib/domain/reminders";
import { discreetStudyCopy } from "@/lib/domain/push";
import { buildSchedule, localDate, localMinutes, sittingAlertCopy, sittings, studyAlertStale } from "@/lib/domain/study-plan";
import { getStudyContext } from "@/lib/db/queries/study";
import { enqueue, type EnqueueResult } from "./outbox";

/**
 * The reminder sender (F29) — the one piece of Roleform that runs on a clock.
 *
 * Called by `GET /api/cron/reminders`, which a scheduler hits every few
 * minutes (docs/notifications.md). Each call settles every reminder that has
 * come due: it CLAIMS a row (pending → settled, one conditional UPDATE) before
 * sending anything, so two overlapping calls can never deliver the same
 * reminder twice — the one that loses the claim simply moves on. A call that
 * dies after claiming loses that reminder rather than repeating it, which is
 * the right way round for something that buzzes a phone.
 *
 * F29.2: a claimed reminder is QUEUED, not sent — one `push_deliveries` row
 * per enabled device, deduplicated on "round:<reminder id>", carrying a TTL
 * that ends when the reminder stops being useful. The outbox (outbox.ts)
 * sends and retries; `sent` here means "handed to the outbox", and
 * `delivered` counts the device rows queued. What the push services did with
 * them lives on `push_deliveries`.
 *
 * No model call, no `ai_runs` row (N13 applied). Logs are counts (N7).
 */

/**
 * Sized to the route's 60s budget: chunks of CHUNK run in parallel, each send
 * times out at 10s, so a batch is at most BATCH / CHUNK × 10s = 40s even when
 * every push service is slow. Rows are claimed chunk by chunk, just before
 * their own send, so anything left over is still pending for the next call.
 */
const BATCH = 100;
const CHUNK = 25;

/** After the round starts, the "how did it go?" nudge stays useful for half a day. */
const AFTER_ROUND_TTL_MS = 12 * 60 * 60_000;

/** Reminder status from what queueing achieved. */
function settledAs(result: EnqueueResult): "sent" | "skipped" {
  return result.reason === "ok" ? "sent" : "skipped";
}

export interface DispatchSummary {
  due: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function dispatchDueReminders(now: Date = new Date()): Promise<DispatchSummary> {
  const due = await db.roundReminder.findMany({
    where: { status: "pending", dueAt: { lte: now } },
    orderBy: { dueAt: "asc" },
    take: BATCH,
    select: {
      id: true,
      clerkUserId: true,
      lead: true,
      round: {
        select: {
          id: true,
          analysisId: true,
          label: true,
          kind: true,
          scheduledAt: true,
          timeZone: true,
          status: true,
          analysis: { select: { company: true } },
        },
      },
    },
  });

  const summary: DispatchSummary = { due: due.length, sent: 0, skipped: 0, failed: 0 };

  const settle = async (reminder: (typeof due)[number]): Promise<"sent" | "skipped" | "failed" | null> => {
    const { round } = reminder;

    // The claim. Whatever happens next, this row is no longer pending.
    const claimed = await db.roundReminder.updateMany({
      where: { id: reminder.id, status: "pending" },
      data: { status: "skipped", settledAt: now },
    });
    if (claimed.count === 0) return null; // Another invocation has it.
    if (!shouldSend(round, reminder.lead, now)) return "skipped";

    const result = await enqueue({
      clerkUserId: reminder.clerkUserId,
      category: "round",
      dedupeKey: `round:${reminder.id}`,
      payload: (prefs) => ({
        ...(prefs.notifyDetails
          ? reminderCopy(
              {
                label: round.label,
                kind: round.kind,
                company: round.analysis.company,
                scheduledAt: round.scheduledAt,
                timeZone: round.timeZone,
              },
              reminder.lead,
              now,
            )
          : discreetReminderCopy(round, reminder.lead, now)),
        url: reminderPath(round.analysisId, round.kind, reminder.lead),
        tag: `round-${round.id}`,
      }),
      // A before-round reminder is worthless once the round starts.
      expiresAt:
        reminder.lead === "after_round" ? new Date(now.getTime() + AFTER_ROUND_TTL_MS) : round.scheduledAt,
    });
    const status = settledAs(result);
    if (status === "sent") {
      await db.roundReminder.update({ where: { id: reminder.id }, data: { status, delivered: result.queued } });
    }
    return status;
  };

  for (let i = 0; i < due.length; i += CHUNK) {
    const outcomes = await Promise.all(
      due.slice(i, i + CHUNK).map((r) =>
        settle(r).catch(async () => {
          // Claimed but not queued (a DB error mid-way): recorded as failed,
          // never retried from here — the claim is what keeps it at-most-once.
          await db.roundReminder.update({ where: { id: r.id }, data: { status: "failed" } }).catch(() => null);
          return "failed" as const;
        }),
      ),
    );
    for (const outcome of outcomes) if (outcome) summary[outcome] += 1;
  }

  // F30: study-session alerts ride the same clock, the same claim and the
  // same budget — whatever room the rounds left in this batch.
  const study = await db.studyReminder.findMany({
    where: { status: "pending", dueAt: { lte: now } },
    orderBy: { dueAt: "asc" },
    take: Math.max(0, BATCH - due.length),
    select: {
      id: true,
      clerkUserId: true,
      startsAt: true,
      plan: { select: { analysisId: true, timeZone: true } },
    },
  });
  summary.due += study.length;

  const settleStudy = async (reminder: (typeof study)[number]): Promise<"sent" | "skipped" | "failed" | null> => {
    const claimed = await db.studyReminder.updateMany({
      where: { id: reminder.id, status: "pending" },
      data: { status: "skipped", settledAt: now },
    });
    if (claimed.count === 0) return null;
    if (studyAlertStale(reminder.startsAt, now)) return "skipped";

    // Re-solve the plan as it stands now and word the sitting it holds at
    // this time — or say nothing if the plan has moved off it.
    const tz = reminder.plan.timeZone;
    const ctx = await getStudyContext(reminder.clerkUserId, reminder.plan.analysisId);
    const today = localDate(now, tz);
    const schedule = buildSchedule({ topics: ctx.topics, settings: ctx.settings, ticks: ctx.ticks, today, fallbackInterviewOn: ctx.nextRoundOn });
    const date = localDate(reminder.startsAt, tz);
    const startMin = localMinutes(reminder.startsAt, tz);
    const sitting = sittings(schedule).find((s) => s.date === date && s.startMin === startMin);
    if (!sitting) return "skipped";
    const result = await enqueue({
      clerkUserId: reminder.clerkUserId,
      category: "study",
      dedupeKey: `study:${reminder.id}`,
      payload: (prefs) => ({
        ...(prefs.notifyDetails ? sittingAlertCopy(sitting, today) : discreetStudyCopy()),
        url: `/analysis/${reminder.plan.analysisId}/schedule`,
        tag: `study-${reminder.plan.analysisId}`,
      }),
      // Same window studyAlertStale uses: ten minutes past the start, it's noise.
      expiresAt: new Date(reminder.startsAt.getTime() + 10 * 60_000),
    });
    const status = settledAs(result);
    if (status === "sent") {
      await db.studyReminder.update({ where: { id: reminder.id }, data: { status, delivered: result.queued } });
    }
    return status;
  };

  for (let i = 0; i < study.length; i += CHUNK) {
    const outcomes = await Promise.all(
      study.slice(i, i + CHUNK).map((r) =>
        settleStudy(r).catch(async () => {
          await db.studyReminder.update({ where: { id: r.id }, data: { status: "failed" } }).catch(() => null);
          return "failed" as const;
        }),
      ),
    );
    for (const outcome of outcomes) if (outcome) summary[outcome] += 1;
  }

  if (summary.due > 0) {
    console.info(
      `[reminders] due=${summary.due} sent=${summary.sent} skipped=${summary.skipped} failed=${summary.failed}`,
    );
  }
  return summary;
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getAnalysis } from "@/lib/db/queries/analysis";
import {
  MAX_DAYS_AHEAD,
  MAX_ROUNDS_PER_ANALYSIS,
  REMINDER_LEADS,
  isTimeZone,
  planReminders,
  type ReminderLead,
} from "@/lib/domain/reminders";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/**
 * Interview rounds (F29). Every field here is the member's own — the date,
 * the label, the notes — and nothing derived or model-written ever edits a
 * round (N3/N15 applied). No model call, no `ai_runs` row (N13 applied), and
 * no plan cap: a reminder costs nothing to keep, so it is on every plan.
 *
 * Saving a round re-derives its reminders from its date and `leads`. Moving
 * the date clears every reminder, sent ones included — "tomorrow" is news
 * again for a round that moved to next week. Keeping the date keeps the
 * record of what already went out. A reminder whose moment has passed is
 * never written (planReminders).
 */

const RoundInput = z.object({
  label: z.string().trim().min(1, "Give the round a name.").max(120),
  /** ISO 8601 with an offset — the browser converts its local input first. */
  scheduledAt: z.iso.datetime({ offset: true }),
  timeZone: z.string().refine(isTimeZone, "Unknown time zone."),
  notes: z.string().max(2000).default(""),
  leads: z.array(z.enum(REMINDER_LEADS as [ReminderLead, ...ReminderLead[]])).max(3).default([]),
});

export type RoundInputValue = z.input<typeof RoundInput>;

function parse(input: RoundInputValue): Result<z.output<typeof RoundInput> & { at: Date }> {
  const parsed = RoundInput.safeParse(input);
  if (!parsed.success) {
    return err(appError("invalid_input", parsed.error.issues[0]?.message ?? "That round doesn't look right."));
  }
  const at = new Date(parsed.data.scheduledAt);
  const now = Date.now();
  if (at.getTime() < now - 365 * 24 * 3600_000 || at.getTime() > now + MAX_DAYS_AHEAD * 24 * 3600_000) {
    return err(appError("invalid_input", "That date is more than a year away — check the year."));
  }
  return ok({ ...parsed.data, at });
}

function revalidate(analysisId: string) {
  revalidatePath(`/analysis/${analysisId}`, "layout");
}

export async function createRound(analysisId: string, input: RoundInputValue): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const value = parse(input);
  if (!value.ok) return value;

  const analysis = await getAnalysis(user.value, analysisId);
  if (!analysis) return err(appError("not_found", "We couldn't find that analysis."));

  const count = await db.interviewRound.count({ where: { clerkUserId: user.value, analysisId } });
  if (count >= MAX_ROUNDS_PER_ANALYSIS) {
    return err(appError("invalid_input", `A posting can hold ${MAX_ROUNDS_PER_ANALYSIS} rounds. Remove an old one first.`));
  }

  const { label, timeZone, notes, leads, at } = value.value;
  const round = await db.interviewRound.create({
    data: {
      clerkUserId: user.value,
      analysisId,
      label,
      scheduledAt: at,
      timeZone,
      notes,
      leads: [...new Set(leads)],
      reminders: {
        create: planReminders(at, leads, new Date()).map((r) => ({
          clerkUserId: user.value,
          lead: r.lead,
          dueAt: r.dueAt,
        })),
      },
    },
    select: { id: true },
  });

  revalidate(analysisId);
  return ok({ id: round.id });
}

export async function updateRound(roundId: string, input: RoundInputValue): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const value = parse(input);
  if (!value.ok) return value;

  const round = await db.interviewRound.findFirst({
    where: { id: roundId, clerkUserId: user.value },
    select: {
      analysisId: true,
      status: true,
      scheduledAt: true,
      reminders: { where: { status: { not: "pending" } }, select: { lead: true } },
    },
  });
  if (!round) return err(appError("not_found", "That round isn't on your list."));

  const { label, timeZone, notes, leads, at } = value.value;
  const moved = round.scheduledAt.getTime() !== at.getTime();
  // Same date: a lead that already fired keeps its row (unique per round and
  // lead) and is not planned again. A new date: everything is planned afresh.
  const settled = moved ? new Set<ReminderLead>() : new Set(round.reminders.map((r) => r.lead));
  const plan =
    round.status === "upcoming" ? planReminders(at, leads, new Date()).filter((r) => !settled.has(r.lead)) : [];

  await db.$transaction([
    db.roundReminder.deleteMany({
      where: { roundId, clerkUserId: user.value, ...(moved ? {} : { status: "pending" as const }) },
    }),
    db.interviewRound.update({
      where: { id: roundId },
      data: { label, scheduledAt: at, timeZone, notes, leads: [...new Set(leads)] },
    }),
    db.roundReminder.createMany({
      data: plan.map((r) => ({ clerkUserId: user.value, roundId, lead: r.lead, dueAt: r.dueAt })),
    }),
  ]);

  revalidate(round.analysisId);
  return ok(null);
}

/**
 * Done or cancelled: pending reminders go with it. Reopened: the round's own
 * `leads` are planned again, skipping any that already went out or have
 * passed.
 */
export async function setRoundStatus(
  roundId: string,
  status: "upcoming" | "done" | "cancelled",
): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const round = await db.interviewRound.findFirst({
    where: { id: roundId, clerkUserId: user.value },
    select: { analysisId: true, scheduledAt: true, leads: true },
  });
  if (!round) return err(appError("not_found", "That round isn't on your list."));

  await db.$transaction([
    db.interviewRound.update({ where: { id: roundId }, data: { status } }),
    status === "upcoming"
      ? db.roundReminder.createMany({
          data: planReminders(round.scheduledAt, round.leads, new Date()).map((r) => ({
            clerkUserId: user.value,
            roundId,
            lead: r.lead,
            dueAt: r.dueAt,
          })),
          skipDuplicates: true,
        })
      : db.roundReminder.deleteMany({ where: { roundId, clerkUserId: user.value, status: "pending" } }),
  ]);

  revalidate(round.analysisId);
  return ok(null);
}

export async function deleteRound(roundId: string): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const round = await db.interviewRound.findFirst({
    where: { id: roundId, clerkUserId: user.value },
    select: { analysisId: true },
  });
  if (!round) return err(appError("not_found", "That round isn't on your list."));

  await db.interviewRound.delete({ where: { id: roundId } });
  revalidate(round.analysisId);
  return ok(null);
}

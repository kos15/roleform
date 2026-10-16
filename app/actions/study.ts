"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { getAnalysis } from "@/lib/db/queries/analysis";
import { getStudyContext } from "@/lib/db/queries/study";
import { isTimeZone } from "@/lib/domain/reminders";
import {
  MAX_DAYS_AHEAD,
  MAX_WINDOWS,
  PERSONAS,
  STUDY_ALERTS,
  WINDOW_MAX_MIN,
  WINDOW_MIN_MIN,
  addDays,
  alertLeadMin,
  buildSchedule,
  defaultSettings,
  isIsoDate,
  localDate,
  sittings,
  wallTimeToInstant,
  type StudyAlert,
  type StudyPersona,
} from "@/lib/domain/study-plan";
import { appError, err, ok, type Result } from "@/lib/domain/types";
import { requireFeature } from "@/lib/features";

/**
 * F30 — saving the study plan and ticking sessions. Every value written here
 * is the member's own choice; the sessions are never stored, only re-solved
 * (lib/domain/study-plan.ts). No model call, no `ai_runs` row (N13 applied),
 * no plan cap: a schedule costs nothing to keep.
 *
 * Each save rewrites the plan's pending alerts from the freshly solved
 * schedule — at most ALERT_HORIZON_DAYS ahead, so a long plan doesn't write
 * a hundred rows that the next change throws away.
 */

const ALERT_HORIZON_DAYS = 14;

const WindowSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,24}$/),
  label: z.string().trim().min(1).max(40),
  days: z.enum(["weekdays", "weekends", "every_day"]),
  at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durMin: z.number().int().min(WINDOW_MIN_MIN).max(WINDOW_MAX_MIN),
  on: z.boolean(),
});

const SettingsSchema = z.object({
  interviewOn: z.string().refine(isIsoDate, "That isn't a date.").nullable(),
  keepRevisionDay: z.boolean(),
  persona: z.enum(PERSONAS as [StudyPersona, ...StudyPersona[]]),
  windows: z.array(WindowSchema).max(MAX_WINDOWS),
  topicOrder: z.array(z.uuid()).max(100),
  topicsOff: z.array(z.uuid()).max(100),
  alert: z.enum(STUDY_ALERTS as [StudyAlert, ...StudyAlert[]]),
});

const SaveInput = z.object({
  settings: SettingsSchema,
  timeZone: z.string().refine(isTimeZone, "Unknown time zone."),
});

export type StudySaveInput = z.input<typeof SaveInput>;

const TickInput = z.object({
  stepId: z.uuid(),
  from: z.number().int().min(0).max(1440),
  to: z.number().int().min(1).max(1440),
  done: z.boolean(),
  timeZone: z.string().refine(isTimeZone, "Unknown time zone."),
});

export type StudyTickInput = z.input<typeof TickInput>;

export async function saveStudyPlan(analysisId: string, input: StudySaveInput): Promise<Result<null>> {
  const featureOn = await requireFeature("study");
  if (!featureOn.ok) return featureOn;
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return err(appError("invalid_input", parsed.error.issues[0]?.message ?? "That plan doesn't look right."));

  const analysis = await getAnalysis(user.value, analysisId);
  if (!analysis) return err(appError("not_found", "We couldn't find that analysis."));

  const { settings, timeZone } = parsed.data;
  const today = localDate(new Date(), timeZone);
  if (settings.interviewOn && (settings.interviewOn < addDays(today, -1) || settings.interviewOn > addDays(today, MAX_DAYS_AHEAD))) {
    return err(appError("invalid_input", `Pick an interview day within the next ${MAX_DAYS_AHEAD} days.`));
  }

  const data = {
    interviewOn: settings.interviewOn ? new Date(`${settings.interviewOn}T00:00:00Z`) : null,
    keepRevisionDay: settings.keepRevisionDay,
    persona: settings.persona,
    windows: settings.windows,
    topicOrder: settings.topicOrder,
    topicsOff: settings.topicsOff,
    alert: settings.alert,
    timeZone,
  };
  const plan = await db.studyPlan.upsert({
    where: { analysisId },
    create: { clerkUserId: user.value, analysisId, ...data },
    update: data,
    select: { id: true, clerkUserId: true },
  });
  if (plan.clerkUserId !== user.value) return err(appError("not_found", "We couldn't find that analysis."));

  await rewriteAlerts(user.value, analysisId, plan.id);
  return ok(null);
}

/**
 * The member's own tick (N15 applied). Done means "this step is finished up
 * to the end of this session"; undone pulls every day's progress on the step
 * back to where the session started.
 */
export async function tickStudySession(analysisId: string, input: StudyTickInput): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = TickInput.safeParse(input);
  if (!parsed.success || parsed.data.to <= parsed.data.from) return err(appError("invalid_input", "That session doesn't look right."));
  const { stepId, from, to, done, timeZone } = parsed.data;

  const step = await db.learningStep.findFirst({
    where: { id: stepId, clerkUserId: user.value, plan: { analysisId } },
    select: { durationMin: true },
  });
  if (!step || to > step.durationMin) return err(appError("not_found", "That session isn't on your plan."));

  // Ticking before any setting was saved still needs a plan row to hang on.
  const plan = await db.studyPlan.upsert({
    where: { analysisId },
    create: { clerkUserId: user.value, analysisId, timeZone, windows: defaultSettings().windows as unknown as Prisma.InputJsonValue },
    update: {},
    select: { id: true, clerkUserId: true },
  });
  if (plan.clerkUserId !== user.value) return err(appError("not_found", "We couldn't find that analysis."));

  const today = new Date(`${localDate(new Date(), timeZone)}T00:00:00Z`);
  if (done) {
    const existing = await db.studyProgress.findUnique({
      where: { planId_stepId_doneOn: { planId: plan.id, stepId, doneOn: today } },
      select: { upToMin: true },
    });
    await db.studyProgress.upsert({
      where: { planId_stepId_doneOn: { planId: plan.id, stepId, doneOn: today } },
      create: { clerkUserId: user.value, planId: plan.id, stepId, doneOn: today, upToMin: to },
      update: { upToMin: Math.max(existing?.upToMin ?? 0, to) },
    });
  } else {
    // Sessions are sequential within a step, so "done up to `from`" is what
    // remains true. A row for today that is already at or below it stays.
    await db.$transaction([
      db.studyProgress.deleteMany({ where: { planId: plan.id, stepId, clerkUserId: user.value, upToMin: { gt: from } } }),
      ...(from > 0
        ? [
            db.studyProgress.upsert({
              where: { planId_stepId_doneOn: { planId: plan.id, stepId, doneOn: today } },
              create: { clerkUserId: user.value, planId: plan.id, stepId, doneOn: today, upToMin: from },
              update: {},
            }),
          ]
        : []),
    ]);
  }

  await rewriteAlerts(user.value, analysisId, plan.id);
  return ok(null);
}

/** Pending alerts re-derived from the plan as it now solves. Sent ones are kept as the record. */
async function rewriteAlerts(clerkUserId: string, analysisId: string, planId: string) {
  const ctx = await getStudyContext(clerkUserId, analysisId);
  const tz = ctx.timeZone;
  const lead = alertLeadMin(ctx.settings.alert);
  const now = new Date();

  const rows: { startsAt: Date; durationMin: number; dueAt: Date }[] = [];
  if (tz && lead !== null) {
    const today = localDate(now, tz);
    const schedule = buildSchedule({
      topics: ctx.topics,
      settings: ctx.settings,
      ticks: ctx.ticks,
      today,
      fallbackInterviewOn: ctx.nextRoundOn,
    });
    const until = addDays(today, ALERT_HORIZON_DAYS);
    for (const s of sittings(schedule)) {
      if (s.date > until) break;
      const startsAt = wallTimeToInstant(s.date, s.startMin, tz);
      const dueAt = new Date(startsAt.getTime() - lead * 60_000);
      if (dueAt.getTime() > now.getTime()) rows.push({ startsAt, durationMin: Math.min(480, Math.max(5, s.durMin)), dueAt });
    }
  }

  await db.$transaction([
    db.studyReminder.deleteMany({ where: { planId, clerkUserId, status: "pending" } }),
    db.studyReminder.createMany({
      data: rows.map((r) => ({ clerkUserId, planId, ...r })),
      // A sitting whose alert already went out keeps that row, not a second one.
      skipDuplicates: true,
    }),
  ]);
}

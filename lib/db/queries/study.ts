import "server-only";
import { db } from "@/lib/db";
import type { StudySettings, StudyTick, StudyTopic, StudyWindow } from "@/lib/domain/study-plan";
import { buildSchedule, defaultSettings, formatDuration, localDate, localMinutes } from "@/lib/domain/study-plan";

/**
 * F30's read path: the gaps' learning steps as study topics, the member's
 * saved choices, their ticks, and the next interview round's day. Everything
 * the scheduler needs; the schedule itself is solved by the caller.
 */

export interface StudyContext {
  topics: StudyTopic[];
  /** Gaps with nothing in the catalog to study — they stay on the Learning tab. */
  uncovered: number;
  settings: StudySettings;
  /** Null until the member first saves. */
  timeZone: string | null;
  ticks: StudyTick[];
  /** The next upcoming round, as a local day in its own zone. */
  nextRoundOn: string | null;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export async function getStudyContext(clerkUserId: string, analysisId: string): Promise<StudyContext> {
  const [gaps, plan, round] = await Promise.all([
    db.skillGap.findMany({
      where: { clerkUserId, analysisId },
      orderBy: [{ ordinal: "asc" }, { severity: "desc" }],
      select: {
        id: true,
        severity: true,
        skill: { select: { name: true } },
        steps: {
          orderBy: { ordinal: "asc" },
          select: { id: true, durationMin: true, entryLabel: true, course: { select: { title: true } } },
        },
      },
    }),
    db.studyPlan.findUnique({
      where: { analysisId },
      include: { progress: { select: { stepId: true, doneOn: true, upToMin: true } } },
    }),
    db.interviewRound.findFirst({
      where: { clerkUserId, analysisId, status: "upcoming", scheduledAt: { gt: new Date() } },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true, timeZone: true },
    }),
  ]);

  const topics: StudyTopic[] = gaps
    .filter((g) => g.steps.length > 0)
    .map((g) => ({
      id: g.id,
      name: g.skill.name,
      severity: Number(g.severity),
      steps: g.steps.map((s) => ({ id: s.id, title: s.course.title, entry: s.entryLabel, durationMin: s.durationMin })),
    }));

  // A plan row belongs to this member (RLS + the scope above); the shape of
  // `windows` was checked by Zod when it was written.
  const settings: StudySettings =
    plan && plan.clerkUserId === clerkUserId
      ? {
          interviewOn: plan.interviewOn ? isoDay(plan.interviewOn) : null,
          keepRevisionDay: plan.keepRevisionDay,
          persona: plan.persona,
          windows: plan.windows as unknown as StudyWindow[],
          topicOrder: plan.topicOrder,
          topicsOff: plan.topicsOff,
          alert: plan.alert,
        }
      : defaultSettings();

  return {
    topics,
    uncovered: gaps.length - topics.length,
    settings,
    timeZone: plan?.timeZone ?? null,
    ticks: (plan?.progress ?? []).map((p) => ({ stepId: p.stepId, doneOn: isoDay(p.doneOn), upToMin: p.upToMin })),
    nextRoundOn: round ? localDate(round.scheduledAt, round.timeZone) : null,
  };
}

/**
 * The Study plan tab's count, as the design words it: "6 sessions",
 * "2h 15m short", or "Set a date" when the interview day has passed.
 * Solved from the same rows as the page, in the member's saved zone.
 */
export async function getStudyTabCount(clerkUserId: string, analysisId: string): Promise<string> {
  const ctx = await getStudyContext(clerkUserId, analysisId);
  if (ctx.topics.length === 0) return "—";
  const tz = ctx.timeZone ?? "UTC";
  const now = new Date();
  const s = buildSchedule({
    topics: ctx.topics,
    settings: ctx.settings,
    ticks: ctx.ticks,
    today: localDate(now, tz),
    nowMin: localMinutes(now, tz),
    fallbackInterviewOn: ctx.nextRoundOn,
  });
  if (s.daysAway < 1) return "Set a date";
  if (s.overflowMin > 0) return `${formatDuration(s.overflowMin)} short`;
  const n = s.days.reduce((a, d) => a + d.sessions.length, 0);
  return `${n} session${n === 1 ? "" : "s"}`;
}

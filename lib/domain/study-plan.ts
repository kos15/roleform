/**
 * F30 — the study plan. PURE: rows in, a schedule out.
 *
 * Every gap's learning steps (already chosen and ordered by the learning
 * engine — lib/domain/plan.ts) are cut into sessions that fit the weekly
 * windows the member says they have, from today up to the interview, most
 * important topic first. Nothing here writes copy about the member or invents
 * work: a session is always a span of minutes of a real learning step, and the
 * only numbers are the step's own duration and the member's own windows.
 *
 * Re-solved on every read and on every change in the browser, so the plan
 * never goes stale: missed sessions simply move forward. Progress is the
 * member's own ticks (N15 applied) — a tick on an earlier day moves where
 * today's plan starts; a tick today only marks the session done.
 *
 * Dates are the member's local calendar days as "YYYY-MM-DD"; times are
 * minutes after local midnight. Converting to instants is `wallTimeToInstant`,
 * used only by the server when it writes alerts.
 */

export type StudyPersona = "pro" | "student";
export type DaySet = "weekdays" | "weekends" | "every_day";
export type StudyAlert = "off" | "before_10" | "before_15" | "before_30";

export interface StudyWindow {
  id: string;
  label: string;
  days: DaySet;
  /** "HH:MM", 24-hour, local. */
  at: string;
  durMin: number;
  on: boolean;
}

export interface StudySettings {
  /** Null until the member picks a day — the fallback is used instead. */
  interviewOn: string | null;
  keepRevisionDay: boolean;
  persona: StudyPersona;
  windows: StudyWindow[];
  /** Gap ids, most important first. Unknown ids are ignored. */
  topicOrder: string[];
  topicsOff: string[];
  alert: StudyAlert;
}

export interface StudyStep {
  id: string;
  /** The course title, read from the catalog. */
  title: string;
  /** Where in the course to start, when the catalog knows. */
  entry: string | null;
  durationMin: number;
}

export interface StudyTopic {
  /** The gap's id. */
  id: string;
  /** The skill's name. */
  name: string;
  /** The gap's severity, 0–100 (lib/domain/severity.ts). */
  severity: number;
  steps: StudyStep[];
}

export interface StudyTick {
  stepId: string;
  doneOn: string;
  upToMin: number;
}

export interface StudySession {
  key: string;
  date: string;
  startMin: number;
  durMin: number;
  stepId: string;
  /** Minutes into the step this session covers: [from, to). */
  from: number;
  to: number;
  topicId: string;
  topicName: string;
  /** 1-based priority of its topic. */
  topicRank: number;
  /** The topic's colour slot: its place in the engine's own order. */
  topicTone: number;
  title: string;
  entry: string | null;
  part: number;
  parts: number;
  done: boolean;
}

/** A revision-day sitting: no new topic, nothing to tick. */
export interface RevisionSession {
  key: string;
  startMin: number;
  durMin: number;
  title: string;
  entry: string;
}

export interface StudyDay {
  date: string;
  kind: "study" | "revision" | "interview";
  sessions: StudySession[];
  /** Only on the revision day. */
  revision: RevisionSession[];
}

export interface TopicStatus {
  id: string;
  name: string;
  on: boolean;
  /** 1-based among the topics that are on; null when off. */
  rank: number | null;
  tone: number;
  severity: number;
  totalMin: number;
  steps: number;
  neededMin: number;
  placedMin: number;
  sessions: number;
}

export interface StudySchedule {
  today: string;
  interviewOn: string;
  /** True when the date is the fallback, not one the member picked. */
  interviewGuessed: boolean;
  revisionOn: string | null;
  /** Days from today to the interview; < 1 means the date has passed. */
  daysAway: number;
  /** Study days after the last session, before revision (only when it fits). */
  freeDays: { from: string; to: string; count: number } | null;
  days: StudyDay[];
  topics: TopicStatus[];
  neededMin: number;
  placedMin: number;
  capacityMin: number;
  overflowMin: number;
}

export interface ScheduleInput {
  topics: StudyTopic[];
  settings: StudySettings;
  ticks: StudyTick[];
  today: string;
  /** The next upcoming interview round's local day, when there is one. */
  fallbackInterviewOn?: string | null;
  /** Minutes after local midnight now: today's windows that have started are skipped. */
  nowMin?: number;
}

/* ----------------------------------------------------------------- limits */

/** A window with less than this left takes nothing more. */
export const MIN_SESSION_MIN = 10;
/** A step only splits into a gap at least this long. */
export const MIN_SPLIT_MIN = 20;
/** A revision sitting is at most an hour. */
export const REVISION_MAX_MIN = 60;
export const WINDOW_STEP_MIN = 15;
export const WINDOW_MIN_MIN = 15;
export const WINDOW_MAX_MIN = 300;
export const MAX_WINDOWS = 8;
/** How far ahead the plan can reach — and how far the date picker allows. */
export const MAX_DAYS_AHEAD = 120;
/** With no date and no round, plan this far out. */
export const DEFAULT_HORIZON_DAYS = 14;

/* ------------------------------------------------------------------ dates */

const DAY_MS = 86_400_000;

function toUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromUtc(toUtc(s)) === s;
}

export function addDays(date: string, n: number): string {
  return fromUtc(toUtc(date) + n * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** 0 = Sunday. */
function weekday(date: string): number {
  return new Date(toUtc(date)).getUTCDay();
}

function onDay(days: DaySet, date: string): boolean {
  const w = weekday(date);
  if (days === "every_day") return true;
  const weekend = w === 0 || w === 6;
  return days === "weekends" ? weekend : !weekend;
}

export function parseClock(at: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(at);
  if (!m) return 0;
  return Math.min(23, +m[1]!) * 60 + Math.min(59, +m[2]!);
}

/** "19:00" — the design's own clock. */
export function formatClock(min: number): string {
  const x = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "Mon 19 Oct". */
export function shortDay(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(toUtc(date)),
  );
}

/** "Today", "Tomorrow", else "Mon 19 Oct". */
export function dayLabel(date: string, today: string): string {
  const d = daysBetween(today, date);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return shortDay(date);
}

/** "Thursday 24 October". */
export function longDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(toUtc(date)),
  );
}

/* ------------------------------------------------------- the member's week */

export const PERSONAS: readonly StudyPersona[] = ["pro", "student"];

export const PERSONA_LABEL: Record<StudyPersona, string> = {
  pro: "Working professional",
  student: "Student",
};

export const PERSONA_NOTE: Record<StudyPersona, string> = {
  pro: "Built around a 9-to-6: a short slot before work, one after dinner and longer blocks at the weekend.",
  student: "Built around lectures: a long block after classes, a short one late in the evening and weekend mornings.",
};

const W = (id: string, label: string, days: DaySet, at: string, durMin: number, on: boolean): StudyWindow => ({
  id,
  label,
  days,
  at,
  durMin,
  on,
});

/** The starting windows for each kind of week. The member edits from here. */
export function personaWindows(p: StudyPersona): StudyWindow[] {
  switch (p) {
    case "pro":
      return [
        W("p1", "Before work", "weekdays", "07:00", 45, true),
        W("p2", "Lunch break", "weekdays", "13:15", 30, false),
        W("p3", "After dinner", "weekdays", "21:00", 60, true),
        W("p4", "Weekend morning", "weekends", "10:00", 150, true),
      ];
    case "student":
      return [
        W("s1", "Between lectures", "weekdays", "12:30", 45, false),
        W("s2", "After classes", "weekdays", "17:00", 90, true),
        W("s3", "Late evening", "weekdays", "21:30", 45, true),
        W("s4", "Weekend morning", "weekends", "10:00", 180, true),
      ];
  }
}

export function defaultSettings(persona: StudyPersona = "pro"): StudySettings {
  return {
    interviewOn: null,
    keepRevisionDay: true,
    persona,
    windows: personaWindows(persona),
    topicOrder: [],
    topicsOff: [],
    alert: "before_15",
  };
}

export const DAY_SET_LABEL: Record<DaySet, string> = {
  weekdays: "Mon\u2060–\u2060Fri",
  weekends: "Sat\u00a0&\u00a0Sun",
  every_day: "Every\u00a0day",
};

/** Tapping the days cycles Mon–Fri → Every day → Sat & Sun. */
export function nextDaySet(d: DaySet): DaySet {
  return d === "weekdays" ? "every_day" : d === "every_day" ? "weekends" : "weekdays";
}

export const STUDY_ALERTS: readonly StudyAlert[] = ["before_10", "before_15", "before_30", "off"];

export const ALERT_LABEL: Record<StudyAlert, string> = {
  before_10: "10 min",
  before_15: "15 min",
  before_30: "30 min",
  off: "Off",
};

/** Minutes before the session the alert fires; null when off. */
export function alertLeadMin(a: StudyAlert): number | null {
  return a === "off" ? null : a === "before_10" ? 10 : a === "before_15" ? 15 : 30;
}

/** How much the posting leans on a topic, in the member's words. */
export function priorityLabel(severity: number): string {
  return severity >= 55 ? "Must-have" : severity >= 30 ? "Strong plus" : "Nice-to-have";
}

/* --------------------------------------------------------------- the solve */

/** Topics in the member's order: their list first, then the rest as the engine ranked them. */
export function orderedTopics(topics: StudyTopic[], order: string[]): StudyTopic[] {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const first = order.map((id) => byId.get(id)).filter((t): t is StudyTopic => Boolean(t));
  const seen = new Set(first.map((t) => t.id));
  return [...first, ...topics.filter((t) => !seen.has(t.id))];
}

export function effectiveInterview(input: Pick<ScheduleInput, "settings" | "today" | "fallbackInterviewOn">): {
  on: string;
  guessed: boolean;
} {
  const picked = input.settings.interviewOn;
  if (picked && isIsoDate(picked)) return { on: picked, guessed: false };
  const fb = input.fallbackInterviewOn;
  if (fb && isIsoDate(fb) && fb > input.today) return { on: fb, guessed: false };
  return { on: addDays(input.today, DEFAULT_HORIZON_DAYS), guessed: true };
}

interface Slot {
  date: string;
  startMin: number;
  durMin: number;
}

/** A day's enabled windows in time order; on `skipBefore` day, ones already started are left out. */
function windowsOn(settings: StudySettings, date: string, skipBefore: number | null): Slot[] {
  const out: Slot[] = [];
  let busyUntil = 0;
  for (const w of settings.windows
    .filter((x) => x.on && x.durMin > 0 && onDay(x.days, date))
    .map((x) => ({ ...x, start: parseClock(x.at) }))
    .sort((p, q) => p.start - q.start)) {
    if (skipBefore !== null && w.start <= skipBefore) continue;
    // Overlapping windows on one day don't count the same minutes twice.
    const start = Math.max(w.start, busyUntil);
    const end = Math.min(w.start + w.durMin, 24 * 60);
    if (end - start >= MIN_SESSION_MIN) out.push({ date, startMin: start, durMin: end - start });
    busyUntil = Math.max(busyUntil, end);
  }
  return out;
}

/** The revision day's sittings: notes, then stories out loud, alternating, an hour at most. */
const REVISION_SITTINGS = [
  { title: "Skim your notes from every topic", entry: "Your roadmap" },
  { title: "Run your three strongest stories out loud", entry: "Interview prep" },
];

export function buildSchedule(input: ScheduleInput): StudySchedule {
  const { settings, today } = input;
  const interview = effectiveInterview(input);
  const daysAway = daysBetween(today, interview.on);
  const keepRevision = settings.keepRevisionDay && daysAway >= 2;
  const revisionOn = keepRevision ? addDays(interview.on, -1) : null;
  const lastIdx = Math.min(daysAway - (keepRevision ? 2 : 1), MAX_DAYS_AHEAD);
  const skipToday = typeof input.nowMin === "number" ? input.nowMin : null;

  // Ticks before today move the start; every tick marks sessions done.
  const base = new Map<string, number>();
  const doneTo = new Map<string, number>();
  for (const t of input.ticks) {
    doneTo.set(t.stepId, Math.max(doneTo.get(t.stepId) ?? 0, t.upToMin));
    if (t.doneOn < today) base.set(t.stepId, Math.max(base.get(t.stepId) ?? 0, t.upToMin));
  }

  const toneOf = new Map(input.topics.map((t, i) => [t.id, i]));
  const off = new Set(settings.topicsOff);
  const ordered = orderedTopics(input.topics, settings.topicOrder);
  const onTopics = ordered.filter((t) => !off.has(t.id) && t.steps.length > 0);
  const rankOf = new Map(onTopics.map((t, i) => [t.id, i + 1]));

  type Work = { topic: StudyTopic; step: StudyStep; pos: number };
  const queue: Work[] = [];
  for (const topic of onTopics)
    for (const step of topic.steps) {
      const pos = Math.min(base.get(step.id) ?? 0, step.durationMin);
      if (pos < step.durationMin) queue.push({ topic, step, pos });
    }

  // Greedy fill: walk each day's windows in time order and pour the
  // priority-ordered steps in, splitting long steps across windows.
  const sessions: StudySession[] = [];
  let capacityMin = 0;
  let lastStudyIdx = -1;
  let qi = 0;
  for (let i = 0; i <= lastIdx; i++) {
    const date = addDays(today, i);
    for (const slot of windowsOn(settings, date, i === 0 ? skipToday : null)) {
      capacityMin += slot.durMin;
      let t = slot.startMin;
      let left = slot.durMin;
      while (left >= MIN_SESSION_MIN && qi < queue.length) {
        const w = queue[qi]!;
        const rem = w.step.durationMin - w.pos;
        if (rem > left && left < MIN_SPLIT_MIN) break;
        const take = Math.min(left, rem);
        sessions.push({
          key: `${w.step.id}:${w.pos}`,
          date,
          startMin: t,
          durMin: take,
          stepId: w.step.id,
          from: w.pos,
          to: w.pos + take,
          topicId: w.topic.id,
          topicName: w.topic.name,
          topicRank: rankOf.get(w.topic.id) ?? 0,
          topicTone: toneOf.get(w.topic.id) ?? 0,
          title: w.step.title,
          entry: w.step.entry,
          part: 0,
          parts: 0,
          done: w.pos + take <= (doneTo.get(w.step.id) ?? 0),
        });
        lastStudyIdx = i;
        w.pos += take;
        t += take;
        left -= take;
        if (w.pos >= w.step.durationMin) qi++;
      }
    }
  }

  // "Part 2 of 3" counts this plan's sessions of a step.
  const perStep = new Map<string, StudySession[]>();
  for (const s of sessions) perStep.set(s.stepId, [...(perStep.get(s.stepId) ?? []), s]);
  for (const list of perStep.values()) list.forEach((s, i) => ((s.part = i + 1), (s.parts = list.length)));

  const neededFor = (topic: StudyTopic) =>
    topic.steps.reduce((sum, st) => sum + st.durationMin - Math.min(base.get(st.id) ?? 0, st.durationMin), 0);
  const topics: TopicStatus[] = ordered
    .filter((t) => t.steps.length > 0)
    .map((t) => {
      const mine = sessions.filter((s) => s.topicId === t.id);
      return {
        id: t.id,
        name: t.name,
        on: !off.has(t.id),
        rank: rankOf.get(t.id) ?? null,
        tone: toneOf.get(t.id) ?? 0,
        severity: t.severity,
        totalMin: t.steps.reduce((s, x) => s + x.durationMin, 0),
        steps: t.steps.length,
        neededMin: neededFor(t),
        placedMin: mine.reduce((s, x) => s + x.durMin, 0),
        sessions: mine.length,
      };
    });

  const neededMin = topics.filter((t) => t.on).reduce((s, t) => s + t.neededMin, 0);
  const placedMin = sessions.reduce((s, x) => s + x.durMin, 0);
  const overflowMin = Math.max(0, neededMin - placedMin);

  const days: StudyDay[] = [];
  for (const s of sessions) {
    const last = days[days.length - 1];
    if (last && last.date === s.date) last.sessions.push(s);
    else days.push({ date: s.date, kind: "study", sessions: [s], revision: [] });
  }

  const spare = lastIdx - lastStudyIdx;
  const freeDays =
    daysAway >= 1 && overflowMin === 0 && neededMin > 0 && spare > 0
      ? { from: addDays(today, lastStudyIdx + 1), to: addDays(today, lastIdx), count: spare }
      : null;

  if (revisionOn) {
    const revision = windowsOn(settings, revisionOn, daysAway - 1 === 0 ? skipToday : null).map((w, k) => ({
      key: `rev-${revisionOn}-${k}`,
      startMin: w.startMin,
      durMin: Math.min(w.durMin, REVISION_MAX_MIN),
      ...REVISION_SITTINGS[k % 2]!,
    }));
    days.push({ date: revisionOn, kind: "revision", sessions: [], revision });
  }
  if (daysAway >= 1) days.push({ date: interview.on, kind: "interview", sessions: [], revision: [] });

  return {
    today,
    interviewOn: interview.on,
    interviewGuessed: interview.guessed,
    revisionOn,
    daysAway,
    freeDays,
    days,
    topics,
    neededMin,
    placedMin,
    capacityMin,
    overflowMin,
  };
}

/* ------------------------------------------------------- making it fit */

export interface StudyTip {
  id: string;
  label: string;
  /** Minutes of the overflow this change would fit. */
  gainMin: number;
  /** True when it fits everything on its own. */
  fitsAll: boolean;
  settings: StudySettings;
}

/** Up to three single changes that fit the most of what doesn't, best first. */
export function fitTips(input: ScheduleInput, schedule: StudySchedule): StudyTip[] {
  if (schedule.overflowMin === 0) return [];
  const s = input.settings;
  const candidates: { id: string; label: string; settings: StudySettings }[] = [];
  const withWindows = (f: (w: StudyWindow) => StudyWindow) => ({ ...s, windows: s.windows.map(f) });

  for (const w of s.windows)
    if (!w.on)
      candidates.push({
        id: `on-${w.id}`,
        label: `Turn on “${w.label}”, ${formatDuration(w.durMin)} ${DAY_SET_LABEL[w.days]}`,
        settings: withWindows((x) => (x.id === w.id ? { ...x, on: true } : x)),
      });
  const weekend = s.windows.find((w) => w.on && w.days === "weekends");
  if (weekend)
    candidates.push({
      id: `hour-${weekend.id}`,
      label: `Add an hour to “${weekend.label}”`,
      settings: withWindows((x) => (x.id === weekend.id ? { ...x, durMin: Math.min(WINDOW_MAX_MIN, x.durMin + 60) } : x)),
    });
  if (s.windows.some((w) => w.on && w.days === "weekdays"))
    candidates.push({
      id: "weekday-15",
      label: "Add 15 minutes to every weekday slot",
      settings: withWindows((x) => (x.on && x.days === "weekdays" ? { ...x, durMin: Math.min(WINDOW_MAX_MIN, x.durMin + 15) } : x)),
    });
  if (s.keepRevisionDay)
    candidates.push({ id: "revision", label: "Study on your revision day too", settings: { ...s, keepRevisionDay: false } });
  const on = schedule.topics.filter((t) => t.on);
  const lowest = on[on.length - 1];
  if (lowest && on.length > 1)
    candidates.push({
      id: `drop-${lowest.id}`,
      label: `Leave out ${lowest.name} (${priorityLabel(lowest.severity).toLowerCase()})`,
      settings: { ...s, topicsOff: [...s.topicsOff, lowest.id] },
    });

  return candidates
    .map((c) => {
      const next = buildSchedule({ ...input, settings: c.settings });
      return { ...c, gainMin: schedule.overflowMin - next.overflowMin, fitsAll: next.overflowMin === 0 };
    })
    .filter((c) => c.gainMin > 0)
    .sort((x, y) => Number(y.fitsAll) - Number(x.fitsAll) || y.gainMin - x.gainMin)
    .slice(0, 3);
}

/* ----------------------------------------------------------------- alerts */

/** Minutes east of UTC that `tz` is at instant `at`. */
function zoneOffsetMinutes(at: number, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(at))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return Math.round((asUtc - Math.floor(at / 1000) * 1000) / 60_000);
}

/** The instant it is `min` minutes after local midnight on `date` in `tz`. */
export function wallTimeToInstant(date: string, min: number, tz: string): Date {
  const wall = toUtc(date) + min * 60_000;
  // Two passes settle the offset across a DST change on that day.
  let guess = wall - zoneOffsetMinutes(wall, tz) * 60_000;
  guess = wall - zoneOffsetMinutes(guess, tz) * 60_000;
  return new Date(guess);
}

/** Minutes after local midnight at `at` in `tz`. */
export function localMinutes(at: Date, tz: string): number {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(at)
    .split(":")
    .map(Number);
  return h! * 60 + m!;
}

/** The member's local calendar day at `now` in `tz`. */
export function localDate(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export interface Sitting {
  date: string;
  startMin: number;
  durMin: number;
  /** What the sitting opens with. */
  first: StudySession;
}

/** Back-to-back sessions in one window are one sitting, and get one alert. */
export function sittings(schedule: StudySchedule): Sitting[] {
  const out: Sitting[] = [];
  for (const day of schedule.days)
    for (const s of day.sessions) {
      if (s.done) continue;
      const last = out[out.length - 1];
      if (last && last.date === s.date && last.startMin + last.durMin === s.startMin) last.durMin += s.durMin;
      else out.push({ date: s.date, startMin: s.startMin, durMin: s.durMin, first: s });
    }
  return out;
}

/* ---------------------------------------------------------------- calendar */

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsLocal(date: string, min: number): string {
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${date.replace(/-/g, "")}T${h}${m}00`;
}

/** Fold to 75 octets per RFC 5545 (character-wise is close enough for our ASCII-heavy text). */
function fold(line: string): string {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 74) out.push((i ? " " : "") + line.slice(i, i + 74));
  return out.join("\r\n");
}

/**
 * The plan as an .ics file: one event per session, in the member's own time
 * zone, with the alert they chose. Every title and line is the catalog's.
 */
export function buildIcs(
  schedule: StudySchedule,
  alert: StudyAlert,
  tz: string,
  stamp: Date,
  heading: string,
  interviewSummary: string,
): string {
  const lead = alertLeadMin(alert);
  const dtstamp = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Roleform//Study plan//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${icsEscape(heading)}`];
  for (const day of schedule.days)
    for (const s of day.sessions) {
      if (s.done) continue;
      const desc = [s.entry ? `Start at: ${s.entry}` : "", s.parts > 1 ? `Part ${s.part} of ${s.parts}` : ""].filter(Boolean).join("\n");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${s.key}-${s.date}@roleform`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;TZID=${tz}:${icsLocal(s.date, s.startMin)}`,
        `DTEND;TZID=${tz}:${icsLocal(s.date, s.startMin + s.durMin)}`,
        fold(`SUMMARY:${icsEscape(`${s.topicName} — ${s.title}`)}`),
      );
      if (desc) lines.push(fold(`DESCRIPTION:${icsEscape(desc)}`));
      if (lead !== null)
        lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(s.topicName)}`, `TRIGGER:-PT${lead}M`, "END:VALARM");
      lines.push("END:VEVENT");
    }
  for (const day of schedule.days)
    for (const r of day.revision) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${r.key}@roleform`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;TZID=${tz}:${icsLocal(day.date, r.startMin)}`,
        `DTEND;TZID=${tz}:${icsLocal(day.date, r.startMin + r.durMin)}`,
        fold(`SUMMARY:${icsEscape(`Revision — ${r.title}`)}`),
        fold(`DESCRIPTION:${icsEscape(`Start at ${r.entry}`)}`),
      );
      if (lead !== null) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Revision", `TRIGGER:-PT${lead}M`, "END:VALARM");
      lines.push("END:VEVENT");
    }
  if (schedule.daysAway >= 1) {
    const d = schedule.interviewOn.replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:interview-${d}@roleform`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${addDays(schedule.interviewOn, 1).replace(/-/g, "")}`,
      fold(`SUMMARY:${icsEscape(interviewSummary)}`),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR", "");
  return lines.join("\r\n");
}

/**
 * What a study alert says: the sitting's first topic and step, when and how
 * long. The sender re-solves the plan at send time and words the sitting as
 * it is then, so a plan that moved never sends yesterday's topic. Skill and
 * course names only — nothing about the member reaches a lock screen (N7).
 */
export function sittingAlertCopy(s: Sitting, today: string): { title: string; body: string } {
  const entry = s.first.entry ? ` · Start at ${s.first.entry}` : "";
  return {
    title: `${s.first.topicName}: ${s.first.title}`,
    body: `${dayLabel(s.date, today)} at ${formatClock(s.startMin)} · ${formatDuration(s.durMin)}${entry}`,
  };
}

/** Too late to be worth a buzz: the sitting started more than ten minutes ago. */
export function studyAlertStale(startsAt: Date, now: Date): boolean {
  return now.getTime() - startsAt.getTime() > 10 * 60_000;
}

/**
 * Interview-round reminders (F29) — the pure half.
 *
 * When a reminder is due, which ones are still worth writing, and what the
 * notification says. No I/O: the server action writes what `planReminders`
 * returns, and the sender renders what `reminderCopy` returns.
 *
 * This module is PURE. It imports nothing from db, ai, supabase or next.
 */

/**
 * What kind of round it is (F29.1) — what the member is preparing FOR. Drives
 * the default name, the notification's wording and which prep surface a
 * reminder opens. The member's own choice; nothing infers it.
 */
export type RoundKind =
  | "screening"
  | "l1"
  | "l2"
  | "l3"
  | "dsa"
  | "system_design"
  | "lld"
  | "behavioral"
  | "managerial"
  | "hr"
  | "take_home"
  | "other";

export const ROUND_KINDS: readonly RoundKind[] = [
  "screening",
  "l1",
  "l2",
  "l3",
  "dsa",
  "system_design",
  "lld",
  "behavioral",
  "managerial",
  "hr",
  "take_home",
  "other",
];

/** Short, for chips and as the default round name. */
export const KIND_LABEL: Record<RoundKind, string> = {
  screening: "Screening call",
  l1: "L1 · Technical",
  l2: "L2 · Technical",
  l3: "L3 · Technical",
  dsa: "DSA / Coding",
  system_design: "System design (HLD)",
  lld: "Low-level design",
  behavioral: "Behavioural",
  managerial: "Hiring manager",
  hr: "HR / Offer",
  take_home: "Take-home",
  other: "Other",
};

/** Lower-case noun phrase for a sentence: "your system design round". */
const KIND_NOUN: Record<RoundKind, string> = {
  screening: "screening call",
  l1: "L1 round",
  l2: "L2 round",
  l3: "L3 round",
  dsa: "coding round",
  system_design: "system design round",
  lld: "low-level design round",
  behavioral: "behavioural round",
  managerial: "hiring manager round",
  hr: "HR round",
  take_home: "take-home deadline",
  other: "interview",
};

/**
 * Where to prepare for a kind of round, inside the analysis. Only surfaces the
 * analysis already has — a pointer, never a generation. Prep's `focus` is a
 * tab key in prep/question-list.tsx; an unknown or empty one falls back to All.
 */
export function prepTarget(kind: RoundKind): { path: string; label: string } {
  switch (kind) {
    case "system_design":
      return { path: "prep?focus=system_design", label: "System design questions" };
    case "l1":
    case "l2":
    case "l3":
    case "lld":
      return { path: "prep?focus=technical", label: "Technical questions" };
    case "dsa":
    case "take_home":
      return { path: "rapid/code", label: "Coding drills" };
    case "behavioral":
    case "managerial":
      return { path: "prep?focus=behavioral", label: "Behavioural questions" };
    case "screening":
    case "hr":
      return { path: "prep?focus=likely", label: "The most likely questions" };
    default:
      return { path: "prep", label: "Interview prep" };
  }
}

/**
 * When a reminder fires, relative to the round. Despite the name, one is a lag:
 * `after_round` is the "how did it go?" nudge that asks the member to mark the
 * round done or book the next one.
 */
export type ReminderLead =
  | "week_before"
  | "three_days_before"
  | "day_before"
  | "morning_of"
  | "hour_before"
  | "quarter_hour_before"
  | "after_round";

export const REMINDER_LEADS: readonly ReminderLead[] = [
  "week_before",
  "three_days_before",
  "day_before",
  "morning_of",
  "hour_before",
  "quarter_hour_before",
  "after_round",
];

/** Fixed offsets in minutes (negative = before). `morning_of` is computed. */
const LEAD_OFFSET_MINUTES: Record<Exclude<ReminderLead, "morning_of">, number> = {
  week_before: -7 * 24 * 60,
  three_days_before: -3 * 24 * 60,
  day_before: -24 * 60,
  hour_before: -60,
  quarter_hour_before: -15,
  after_round: 2 * 60,
};

/** Morning-of fires at this local hour on the round's day… */
const MORNING_HOUR = 8;
/** …and only when that leaves at least this long before the round. */
const MORNING_MIN_GAP_MINUTES = 90;

export const LEAD_LABEL: Record<ReminderLead, string> = {
  week_before: "A week before",
  three_days_before: "3 days before",
  day_before: "A day before",
  morning_of: "Morning of (8 AM)",
  hour_before: "An hour before",
  quarter_hour_before: "15 minutes before",
  after_round: "After it — “how did it go?”",
};

/** What a new round asks for unless the member says otherwise. */
export const DEFAULT_LEADS: readonly ReminderLead[] = [
  "three_days_before",
  "day_before",
  "morning_of",
  "hour_before",
  "after_round",
];

/**
 * What a round entered with a date but no time asks for (the JD screen's
 * optional interview date). Only the leads a placeholder time can't make
 * wrong: a day-level "in 3 days" or "tomorrow" is right whatever the hour,
 * and morning-of fires at 8 AM local. "An hour before" a time nobody gave
 * would be a reminder about an invented fact.
 */
export const DATE_ONLY_LEADS: readonly ReminderLead[] = ["three_days_before", "day_before", "morning_of"];

/** The placeholder hour for a date-only round — late enough for morning-of to fire. */
export const DATE_ONLY_HOUR = 10;

/** A round further out than this is almost certainly a typo in the year. */
export const MAX_DAYS_AHEAD = 366;

/** A sanity ceiling per posting, not a plan cap (F29 is on every plan). */
export const MAX_ROUNDS_PER_ANALYSIS = 20;

/** Minutes east of UTC that `tz` is at instant `at`. */
function zoneOffsetMinutes(at: Date, tz: string): number {
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
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** The instant it is `hour`:00 local time on the round's own calendar day. */
function localHourOnDay(day: Date, hour: number, tz: string): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(day)
    .split("-")
    .map(Number);
  const wall = Date.UTC(y, m - 1, d, hour, 0, 0);
  // Two passes settle the offset across a DST change on that day.
  let guess = wall - zoneOffsetMinutes(new Date(wall), tz) * 60_000;
  guess = wall - zoneOffsetMinutes(new Date(guess), tz) * 60_000;
  return new Date(guess);
}

/** When `lead` fires for a round at `scheduledAt` in `tz`, or null if it can't. */
export function dueAtFor(scheduledAt: Date, lead: ReminderLead, tz: string): Date | null {
  if (lead === "morning_of") {
    const at = localHourOnDay(scheduledAt, MORNING_HOUR, tz);
    // A 9 AM round gets the hour-before, not an 8 AM "it's today".
    return scheduledAt.getTime() - at.getTime() >= MORNING_MIN_GAP_MINUTES * 60_000 ? at : null;
  }
  return new Date(scheduledAt.getTime() + LEAD_OFFSET_MINUTES[lead] * 60_000);
}

/**
 * The reminder rows a round should carry, given when it is and what the
 * member asked for. A lead whose moment has already passed is dropped rather
 * than written as instantly due: "your interview is in 3 days" sent the
 * evening before would be wrong, and the shorter leads cover that window.
 */
export function planReminders(
  scheduledAt: Date,
  leads: readonly ReminderLead[],
  tz: string,
  now: Date,
): { lead: ReminderLead; dueAt: Date }[] {
  return [...new Set(leads)]
    .map((lead) => ({ lead, dueAt: dueAtFor(scheduledAt, lead, tz) }))
    .filter((r): r is { lead: ReminderLead; dueAt: Date } => r.dueAt !== null && r.dueAt.getTime() > now.getTime())
    .sort((x, y) => x.dueAt.getTime() - y.dueAt.getTime());
}

/** True when `tz` is an IANA zone this runtime can format in. */
export function isTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Calendar-day key (YYYY-MM-DD) of an instant, in a zone. */
function dayKey(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

function clock(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(at);
}

/**
 * "today at 3:00 PM", "tomorrow at 10:30 AM", "Thu 16 Oct at 9:00 AM" — in the
 * member's own zone. Relative to `now`, so a reminder sent late says when the
 * round actually is, not what the lead promised.
 */
export function whenPhrase(scheduledAt: Date, tz: string, now: Date): string {
  const today = dayKey(now, tz);
  const tomorrow = dayKey(new Date(now.getTime() + 24 * 3600_000), tz);
  const day = dayKey(scheduledAt, tz);
  const time = clock(scheduledAt, tz);
  if (day === today) return `today at ${time}`;
  if (day === tomorrow) return `tomorrow at ${time}`;
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(
    scheduledAt,
  );
  return `${date} at ${time}`;
}

function untilPhrase(scheduledAt: Date, now: Date): string {
  const minutes = Math.round((scheduledAt.getTime() - now.getTime()) / 60_000);
  if (minutes <= 1) return "now";
  if (minutes < 60) return `in ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 20) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  return "";
}

/** Whole calendar days from `now` to the round, in the round's zone. */
function daysUntil(scheduledAt: Date, tz: string, now: Date): number {
  const toUtcDay = (at: Date) => {
    const [y, m, d] = dayKey(at, tz).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtcDay(scheduledAt) - toUtcDay(now)) / 86_400_000);
}

/** "in 3 hours", "today", "tomorrow", "in 5 days" — or "" once it has started. */
export function countdownPhrase(scheduledAt: Date, tz: string, now: Date): string {
  if (scheduledAt.getTime() <= now.getTime()) return "";
  const until = untilPhrase(scheduledAt, now);
  if (until) return until;
  const days = daysUntil(scheduledAt, tz, now);
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

export interface ReminderCopyInput {
  label: string;
  kind: RoundKind;
  company: string | null;
  scheduledAt: Date;
  timeZone: string;
}

/**
 * The notification itself. Carries the round's name and kind, the company
 * and the time — what the member chose and what the posting named — and
 * nothing else. Notes never travel: a lock screen is read by whoever is
 * holding the phone. Computed at send time, so a late reminder still says
 * when the round actually is.
 */
export function reminderCopy(
  round: ReminderCopyInput,
  lead: ReminderLead,
  now: Date,
): { title: string; body: string } {
  const at = round.company ? ` at ${round.company}` : "";
  const when = whenPhrase(round.scheduledAt, round.timeZone, now);
  const noun = KIND_NOUN[round.kind];
  const prep = prepTarget(round.kind).label;

  if (lead === "after_round") {
    return clip(
      `How did ${round.label} go?`,
      "Mark it done, or add the next round — we'll remind you before that one too.",
    );
  }

  const until = untilPhrase(round.scheduledAt, now);
  if (until) {
    return clip(`Your ${noun}${at} is ${until}`, `${round.label} · ${when}. ${prep} are one tap away.`);
  }

  const days = daysUntil(round.scheduledAt, round.timeZone, now);
  if (days === 0) return clip(`Today: your ${noun}${at}`, `${round.label} · ${when}. A last pass: ${prep.toLowerCase()}.`);
  if (days === 1) return clip(`Tomorrow: your ${noun}${at}`, `${round.label} · ${when}. Tonight, run through ${prep.toLowerCase()}.`);
  return clip(
    `${days} days to your ${noun}${at}`,
    `${round.label} · ${when}. A good time to start on ${prep.toLowerCase()}.`,
  );
}

function clip(title: string, body: string) {
  return { title: title.slice(0, 120), body: body.slice(0, 240) };
}

/**
 * Whether a due reminder is still worth sending. Before-the-round reminders
 * need the round still ahead and still on; the after-round nudge needs it to
 * have happened and not yet been marked. Anything else is skipped, never
 * delivered late.
 */
export function shouldSend(
  round: { status: "upcoming" | "done" | "cancelled"; scheduledAt: Date },
  lead: ReminderLead,
  now: Date,
): boolean {
  if (round.status !== "upcoming") return false;
  const ahead = round.scheduledAt.getTime() > now.getTime();
  return lead === "after_round" ? !ahead : ahead;
}

/** In-app path a reminder opens: prep for the round's kind, or the rounds tab. */
export function reminderPath(analysisId: string, kind: RoundKind, lead: ReminderLead): string {
  if (lead === "after_round") return `/analysis/${analysisId}/rounds`;
  return `/analysis/${analysisId}/${prepTarget(kind).path}`;
}

/** "iPhone · Safari" from a user-agent string. The raw string is never stored. */
export function deviceLabel(userAgent: string): string {
  const ua = userAgent || "";
  const device = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "Device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua) || /CriOS/.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  return `${device} · ${browser}`;
}

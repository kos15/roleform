/**
 * Interview-round reminders (F29) — the pure half.
 *
 * When a reminder is due, which ones are still worth writing, and what the
 * notification says. No I/O: the server action writes what `planReminders`
 * returns, and the sender renders what `reminderCopy` returns.
 *
 * This module is PURE. It imports nothing from db, ai, supabase or next.
 */

export type ReminderLead = "day_before" | "hour_before" | "quarter_hour_before";

export const REMINDER_LEADS: readonly ReminderLead[] = ["day_before", "hour_before", "quarter_hour_before"];

export const LEAD_MINUTES: Record<ReminderLead, number> = {
  day_before: 24 * 60,
  hour_before: 60,
  quarter_hour_before: 15,
};

export const LEAD_LABEL: Record<ReminderLead, string> = {
  day_before: "A day before",
  hour_before: "An hour before",
  quarter_hour_before: "15 minutes before",
};

/** What a new round asks for unless the member says otherwise. */
export const DEFAULT_LEADS: readonly ReminderLead[] = ["day_before", "hour_before"];

/** A round further out than this is almost certainly a typo in the year. */
export const MAX_DAYS_AHEAD = 366;

/** A sanity ceiling per posting, not a plan cap (F29 is on every plan). */
export const MAX_ROUNDS_PER_ANALYSIS = 20;

export function dueAtFor(scheduledAt: Date, lead: ReminderLead): Date {
  return new Date(scheduledAt.getTime() - LEAD_MINUTES[lead] * 60_000);
}

/**
 * The reminder rows a round should carry, given when it is and what the
 * member asked for. A lead whose moment has already passed is dropped rather
 * than written as instantly due: "your interview is tomorrow" sent two hours
 * before the call would be wrong, and the shorter leads cover that window.
 */
export function planReminders(
  scheduledAt: Date,
  leads: readonly ReminderLead[],
  now: Date,
): { lead: ReminderLead; dueAt: Date }[] {
  return [...new Set(leads)]
    .map((lead) => ({ lead, dueAt: dueAtFor(scheduledAt, lead) }))
    .filter((r) => r.dueAt.getTime() > now.getTime());
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

export interface ReminderCopyInput {
  label: string;
  company: string | null;
  scheduledAt: Date;
  timeZone: string;
}

/**
 * The notification itself. Carries the round's label, the company and the
 * time — what the member typed and what the posting named — and nothing else.
 * Notes never travel: a lock screen is read by whoever is holding the phone.
 */
export function reminderCopy(round: ReminderCopyInput, now: Date): { title: string; body: string } {
  const until = untilPhrase(round.scheduledAt, now);
  const subject = round.company ? `${round.company} interview` : "Interview";
  const title = `${subject} ${until || whenPhrase(round.scheduledAt, round.timeZone, now)}`;
  const body = `${round.label} · ${whenPhrase(round.scheduledAt, round.timeZone, now)}. Your prep is one tap away.`;
  return { title: title.slice(0, 120), body: body.slice(0, 240) };
}

/**
 * Whether a due reminder is still worth sending. A round that has started,
 * finished or been called off gets nothing — the reminder is skipped, not
 * delivered late.
 */
export function shouldSend(
  round: { status: "upcoming" | "done" | "cancelled"; scheduledAt: Date },
  now: Date,
): boolean {
  return round.status === "upcoming" && round.scheduledAt.getTime() > now.getTime();
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

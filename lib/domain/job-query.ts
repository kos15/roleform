/**
 * The job search query — built from the stored profile, never from anything
 * else (N19, JS-4). PURE.
 *
 * What is sent to a provider is titles, canonical skill names, a city and a
 * remote flag. Nothing else. Never a bullet, a name, an email, a JD — this
 * type has no field for any of them, and that is the guard: a caller cannot
 * accidentally widen the payload without widening this interface first.
 */
import type { StoredResume } from "@/lib/ai/schemas/resume-json";

export interface JobQuery {
  titles: string[];
  skills: string[];
  location: string;
  remote: boolean;
  /**
   * The recency window, in days; 0 means any date (F22.1, R11). Sent to a
   * provider's own filter where it has one and enforced on our side for all,
   * because a sort is not a filter.
   */
  postedWithinDays: number;
}

const MAX_SKILLS = 8;

/** The windows the query editor offers. 0 = any date. Default 14 (R11). */
export const POSTED_WITHIN_OPTIONS = [1, 7, 14, 30, 0] as const;
export const DEFAULT_POSTED_WITHIN = 14;

/** Clamp anything a client sends onto the offered set (and the DB CHECK). */
export function clampPostedWithin(days: number | undefined): number {
  return POSTED_WITHIN_OPTIONS.includes(days as (typeof POSTED_WITHIN_OPTIONS)[number])
    ? (days as number)
    : DEFAULT_POSTED_WITHIN;
}

/** At most this many keyword variants go to each source per search (R9). */
export const MAX_KEYWORD_VARIANTS = 3;

/**
 * The keyword strings one search runs against every source (F22.1, R9/R10).
 *
 * The same work is titled differently across employers, so one title is one
 * bet. A search runs up to three: the member's titles in their own order;
 * when they gave none, a skill-led query from their top three skills. Each is
 * a title or skill names — the same N19 payload, just more than one of it.
 */
export function planKeywords(query: Pick<JobQuery, "titles" | "skills">): string[] {
  const seen = new Set<string>();
  const variants: string[] = [];
  for (const raw of query.titles) {
    const title = raw.trim().replace(/\s+/g, " ");
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    variants.push(title);
    if (variants.length === MAX_KEYWORD_VARIANTS) break;
  }
  if (variants.length === 0) {
    const skillLed = query.skills.slice(0, 3).join(" ").trim();
    if (skillLed) variants.push(skillLed);
  }
  return variants;
}

/**
 * Titles come from what the member told us they want
 * (`x_roleform.preferences.targetTitles`, comma-separated), falling back to
 * the most recent role's position when they haven't said. Skills are the
 * profile's own declared Skills section, in its existing order, capped at
 * eight — an evidence-citation ranking (which bullets actually got tailored
 * with which skill) would be a better ordering and needs a database read
 * this function deliberately does not take, staying PURE like every other
 * `lib/domain` function; `lib/db/queries/jobs.ts` is free to re-order before
 * this reaches the UI if that read is ever worth adding.
 */
export function buildJobQuery(resume: StoredResume): JobQuery {
  const stated = (resume.x_roleform?.preferences?.targetTitles ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const titles = stated.length > 0 ? stated : latestPosition(resume);

  const skills = resume.skills
    .map((s) => s.name.trim())
    .filter(Boolean)
    .slice(0, MAX_SKILLS);

  const location = [resume.basics.location.city, resume.basics.location.countryCode]
    .filter(Boolean)
    .join(", ");

  const remote = /remote/i.test(resume.x_roleform?.preferences?.workMode ?? "");

  return { titles, skills, location, remote, postedWithinDays: DEFAULT_POSTED_WITHIN };
}

/**
 * The profile facts the triage reads (F22.1). PURE, from the stored résumé
 * alone — the same document `buildJobQuery` reads, nothing new leaves it.
 */
export interface ProfileFacts {
  /** Every canonical-or-declared skill on the profile, as written there. */
  skills: string[];
  /** Stated target titles first, then every position the member has held. */
  titles: string[];
  /** The member's own city, lowercased, or "" when the profile has none. */
  city: string;
  remoteOnly: boolean;
  /** Whole years across `work[]`, overlaps merged; null when no dates. */
  years: number | null;
}

export function profileFacts(resume: StoredResume, now: Date = new Date()): ProfileFacts {
  const stated = (resume.x_roleform?.preferences?.targetTitles ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const held = resume.work.map((w) => w.position.trim()).filter(Boolean);
  return {
    skills: resume.skills.map((s) => s.name.trim()).filter(Boolean),
    titles: [...new Set([...stated, ...held])],
    city: (resume.basics.location.city ?? "").trim().toLowerCase(),
    remoteOnly: /remote/i.test(resume.x_roleform?.preferences?.workMode ?? "") &&
      !/hybrid|office|on-?site/i.test(resume.x_roleform?.preferences?.workMode ?? ""),
    years: yearsOfExperience(resume.work, now),
  };
}

/** Merged spans so two overlapping roles don't count twice. */
function yearsOfExperience(
  work: Array<{ startDate: string | null; endDate: string | null }>,
  now: Date,
): number | null {
  const spans = work
    .map((w) => {
      const start = w.startDate ? Date.parse(w.startDate) : NaN;
      const end = w.endDate ? Date.parse(w.endDate) : now.getTime();
      return Number.isFinite(start) && Number.isFinite(end) && end > start ? [start, end] : null;
    })
    .filter((s): s is number[] => s !== null)
    .sort((a, b) => a[0] - b[0]);
  if (spans.length === 0) return null;

  let total = 0;
  let [curStart, curEnd] = spans[0];
  for (const [start, end] of spans.slice(1)) {
    if (start <= curEnd) curEnd = Math.max(curEnd, end);
    else {
      total += curEnd - curStart;
      [curStart, curEnd] = [start, end];
    }
  }
  total += curEnd - curStart;
  return Math.floor(total / (365.25 * 86_400_000));
}

function latestPosition(resume: StoredResume): string[] {
  // work[] is not guaranteed sorted; pick the entry with no endDate (current)
  // first, else the one with the latest startDate.
  const current = resume.work.find((w) => w.endDate === null);
  if (current) return [current.position];

  const sorted = [...resume.work].sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
  return sorted[0] ? [sorted[0].position] : [];
}

/** A short, honest label for the empty state and the query editor's placeholder. */
export function queryIsEmpty(query: JobQuery): boolean {
  return query.titles.length === 0 && query.skills.length === 0;
}

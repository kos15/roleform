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
}

const MAX_SKILLS = 8;

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

  return { titles, skills, location, remote };
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

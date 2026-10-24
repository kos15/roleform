/**
 * The catalog's shape rules. PURE — no I/O, so `pnpm check:catalog` and the seed
 * script can both import it.
 *
 * ── Why lane coverage counts skills[0] only ─────────────────────────────────
 * `skills[0]` is what an entry TEACHES (see the header of courses.ts). A Redux
 * video that lists React second is useful to React people; it does not close a
 * React gap, so it cannot be what makes "React has a Watch entry" true.
 */
import { laneOf, type Lane } from "../domain/lanes";
import type { CourseDef } from "./courses";
import { typeOf } from "./quality";

const LANES: Lane[] = ["watch", "read"];

/** One key per resource: the same YouTube video or playlist is one URL however it is spelled. */
export function urlKey(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  if (host === "youtu.be") return `yt:${u.pathname.split("/")[1] ?? ""}`;
  if (host === "youtube.com") {
    if (u.pathname.startsWith("/playlist")) return `ytlist:${u.searchParams.get("list") ?? ""}`;
    const id = u.searchParams.get("v");
    if (id) return `yt:${id}`;
  }
  return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/$/, "")}${u.search}`;
}

const CHANNEL_PATH = /^\/(@|channel\/|c\/|user\/)/;

function isChannelUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /^(www\.|m\.)?youtube\.com$/i.test(u.hostname) && CHANNEL_PATH.test(u.pathname);
  } catch {
    return false;
  }
}

export const laneOfDef = (def: CourseDef): Lane => laneOf(def.type ?? typeOf(def));

export function catalogProblems(courses: CourseDef[], skills: string[]): string[] {
  const problems: string[] = [];

  const seen = new Set<string>();
  for (const def of courses) {
    const key = urlKey(def.url);
    if (seen.has(key)) problems.push(`Duplicate URL: ${def.url}`);
    seen.add(key);

    if (isChannelUrl(def.url)) {
      problems.push(`YouTube channel is not a single video or playlist: ${def.url}`);
    }

    if (def.url.includes("/shorts/")) problems.push(`YouTube Short is not a lesson: ${def.url}`);

    if ((def.type ?? typeOf(def)) === "doc" && !def.docKind) {
      problems.push(`Doc has no docKind (official | tutorial): ${def.url}`);
    }
  }

  for (const skill of skills) {
    for (const lane of LANES) {
      const covered = courses.some((def) => def.skills[0] === skill && laneOfDef(def) === lane);
      if (!covered) problems.push(`Skill "${skill}" has no ${lane} entry (skills[0] === "${skill}").`);
    }
  }

  return problems;
}

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

export const laneOfDef = (def: CourseDef): Lane => laneOf(def.type ?? typeOf(def));

export function catalogProblems(courses: CourseDef[], skills: string[]): string[] {
  const problems: string[] = [];

  const seen = new Set<string>();
  for (const def of courses) {
    if (seen.has(def.url)) problems.push(`Duplicate URL: ${def.url}`);
    seen.add(def.url);

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

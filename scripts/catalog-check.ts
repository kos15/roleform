/**
 * Dry check of the curated catalog — no database, safe to run any time.
 *
 * Runs the pure shape rules (`catalogProblems`), then requests every entry:
 * YouTube through oEmbed, everything else through `checkLiveness`. For YouTube
 * entries it also compares the channel oEmbed reports with `author`.
 *
 *   FAIL   a shape problem · a dead link · an author that does not match oEmbed
 *   WARN   blocked (we could not confirm) · author not in KNOWN_CREATORS
 *
 * Makes real network requests. Exit 1 on any FAIL.
 *
 *   pnpm check:catalog
 */
import { COURSES } from "../lib/catalog/courses";
import { SKILLS } from "../lib/catalog/skills";
import { NODES } from "../lib/catalog/taxonomy";
import { typeOf } from "../lib/catalog/quality";
import { laneOf } from "../lib/domain/lanes";
import { catalogProblems } from "../lib/catalog/problems";
import { checkCourseLink, type LinkCheck } from "../lib/catalog/liveness";
import { KNOWN_CREATORS } from "../lib/catalog/creators";

const CONCURRENCY = 5;
const norm = (s: string) => s.trim().toLowerCase();

async function main() {
  const problems = catalogProblems(COURSES, SKILLS.map((s) => s.name));

  const results: LinkCheck[] = new Array(COURSES.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < COURSES.length) {
        const i = next++;
        const def = COURSES[i];
        results[i] = await checkCourseLink({ url: def.url, type: def.type ?? typeOf(def) });
      }
    }),
  );

  const dead: string[] = [];
  const blocked: string[] = [];
  const mismatches: string[] = [];
  const warnings: string[] = [];

  const rows = COURSES.map((def, i) => {
    const type = def.type ?? typeOf(def);
    const { liveness, authorName } = results[i];
    if (liveness === "dead") dead.push(def.url);
    if (liveness === "blocked") blocked.push(def.url);
    if (authorName !== null && norm(authorName) !== norm(def.author ?? "")) {
      mismatches.push(`${def.url} — oEmbed says "${authorName}", entry says "${def.author ?? ""}"`);
    }
    if (type === "video" && def.author) {
      const root = NODES.get(def.skills[0])?.path[0] ?? def.skills[0];
      const known = (KNOWN_CREATORS[root] ?? []).map(norm);
      if (!known.includes(norm(def.author))) {
        warnings.push(`${def.url} — "${def.author}" is not a known ${root} creator`);
      }
    }
    return { skill: def.skills[0], lane: laneOf(type), author: def.author ?? "-", title: def.title, url: def.url };
  }).sort((a, b) => a.skill.localeCompare(b.skill) || a.lane.localeCompare(b.lane));

  for (const r of rows) console.log(`${r.skill} · ${r.lane} · ${r.author} · ${r.title} · ${r.url}`);

  const section = (label: string, items: string[]) => {
    if (items.length === 0) return;
    console.log(`\n${label} (${items.length})`);
    for (const item of items) console.log(`  ${item}`);
  };
  section("PROBLEMS", problems);
  section("DEAD", dead);
  section("AUTHOR MISMATCH", mismatches);
  section("BLOCKED (could not confirm)", blocked);
  section("WARN", warnings);

  console.log(
    `\n${COURSES.length} entries · problems ${problems.length} · dead ${dead.length} · mismatches ${mismatches.length} · blocked ${blocked.length} · warnings ${warnings.length}`,
  );
  process.exit(problems.length + dead.length + mismatches.length > 0 ? 1 : 0);
}

main();

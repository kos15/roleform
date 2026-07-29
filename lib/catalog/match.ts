/**
 * Course matching (F8). PURE — no LLM (N8), no I/O.
 *
 * Order: skill overlap → level fit → free-first → shortest.
 *
 * Deterministic on purpose. This is the "as little AI as possible" principle:
 * an LLM here would buy nothing and could produce a URL, which is the one
 * failure that costs the Learning tab its credibility permanently.
 */

export interface MatchableCourse {
  id: string;
  title: string;
  provider: string;
  url: string;
  mark: string;
  priceLabel: string;
  lengthLabel: string;
  lengthMinutes: number;
  level: "beginner" | "intermediate" | "advanced";
  isFree: boolean;
  skillNames: string[];
}

export interface GapForMatching {
  skillName: string;
  userLevel: "none" | "exposure" | "working" | "strong";
  requiredLevel: "exposure" | "working" | "strong" | "expert";
}

const LEVEL_FOR_USER = {
  none: "beginner",
  exposure: "beginner",
  working: "intermediate",
  strong: "advanced",
} as const;

/**
 * Two courses per gap (F8). Fewer is correct when the catalog has fewer —
 * an honest empty state beats an invented link every time (specs §13).
 */
export function matchCourses(
  gap: GapForMatching,
  catalog: MatchableCourse[],
  limit = 2,
): MatchableCourse[] {
  const wanted = gap.skillName.toLowerCase();
  const idealLevel = LEVEL_FOR_USER[gap.userLevel];

  const candidates = catalog.filter((c) =>
    c.skillNames.some((s) => s.toLowerCase() === wanted),
  );

  return candidates
    .map((course) => ({
      course,
      // 1. skill overlap — a course teaching only this skill beats a broad one
      overlap: 1 / course.skillNames.length,
      // 2. level fit — distance from the level this user should start at
      levelDistance: Math.abs(levelIndex(course.level) - levelIndex(idealLevel)),
    }))
    .sort((a, b) => {
      if (a.levelDistance !== b.levelDistance) return a.levelDistance - b.levelDistance;
      if (a.overlap !== b.overlap) return b.overlap - a.overlap;
      if (a.course.isFree !== b.course.isFree) return a.course.isFree ? -1 : 1;
      if (a.course.lengthMinutes !== b.course.lengthMinutes)
        return a.course.lengthMinutes - b.course.lengthMinutes;
      return a.course.title.localeCompare(b.course.title);
    })
    .slice(0, limit)
    .map((x) => x.course);
}

/**
 * Courses for the named concepts a worked answer rests on (F7.2).
 *
 * Same deterministic matcher, same law: a concept that maps to nothing in the
 * catalog yields nothing. The model names concepts; it never names a link (N8).
 * Concept order is preserved so the first idea in the answer leads.
 */
export function matchCoursesForConcepts(
  concepts: string[],
  catalog: MatchableCourse[],
  limit = 3,
): MatchableCourse[] {
  const seen = new Set<string>();
  const out: MatchableCourse[] = [];

  for (const concept of concepts) {
    for (const course of matchCourses(
      { skillName: concept, userLevel: "working", requiredLevel: "working" },
      catalog,
      limit,
    )) {
      if (seen.has(course.id)) continue;
      seen.add(course.id);
      out.push(course);
      if (out.length >= limit) return out;
    }
  }

  return out;
}

function levelIndex(level: "beginner" | "intermediate" | "advanced"): number {
  return level === "beginner" ? 0 : level === "intermediate" ? 1 : 2;
}

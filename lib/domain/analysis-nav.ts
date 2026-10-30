/**
 * The analysis journey. PURE — no I/O.
 *
 * One finished analysis opens onto several surfaces, and they are a path, not
 * a pile: tailor the résumé, rehearse the questions it invites, close the gaps,
 * fit the learning into the days you have, tick it off, drill, then track the
 * rounds. This list is that path, in that order, and it is the only one: the
 * tab cards, the phone dock, the desktop rail and the "Up next" card all read
 * it, so they can never disagree about what comes next.
 *
 * Pitches carry no number. How many drafts or questions a run produced is the
 * run's fact (§5 — `capResumes` varies per member), so counts are phrased from
 * rows by `sectionCountLabels`, never written into copy.
 */

export type SectionSlug = "resumes" | "prep" | "learning" | "schedule" | "roadmap" | "rapid" | "rounds";

export interface SectionDef {
  slug: SectionSlug;
  /** The tab card's name. */
  label: string;
  /** A phone dock slot — five across a 360px screen, so nine characters at most. */
  short: string;
  /** What opening it gets you, for the "Up next" card. */
  pitch: string;
}

export const ANALYSIS_SECTIONS: readonly SectionDef[] = [
  { slug: "resumes", label: "Résumés", short: "Résumés", pitch: "Drafts retargeted at this posting from your own bullets — nothing invented." },
  { slug: "prep", label: "Interview prep", short: "Prep", pitch: "The questions this posting invites, each with an answer framework and the bullets to pull from." },
  { slug: "learning", label: "Learning", short: "Learning", pitch: "What the posting asks that your profile can't evidence yet, and vetted courses that close it." },
  { slug: "schedule", label: "Study plan", short: "Study", pitch: "Fit the learning into the days you have before the interview." },
  { slug: "roadmap", label: "Roadmap", short: "Roadmap", pitch: "Questions and courses compiled into one checklist you tick through." },
  { slug: "rapid", label: "Rapid prep", short: "Rapid", pitch: "Revision cards, a quick quiz and coding drills for the night before." },
  { slug: "rounds", label: "Rounds", short: "Rounds", pitch: "Log each interview round and get a reminder before it starts." },
];

/** F31: a switched-off surface leaves the journey entirely. */
export function visibleSections(hidden: readonly string[]): SectionDef[] {
  return ANALYSIS_SECTIONS.filter((s) => !hidden.includes(s.slug));
}

/**
 * Which section a path is in. A preview is a résumé opened, and a rapid
 * sub-page is still rapid prep; anything else under the analysis (the
 * portfolio, the run screen) is not a step on the path.
 */
export function sectionFromPath(pathname: string, analysisId: string): SectionSlug | null {
  const base = `/analysis/${analysisId}/`;
  if (!pathname.startsWith(base)) return null;
  const first = pathname.slice(base.length).split("/")[0];
  if (first === "preview") return "resumes";
  return ANALYSIS_SECTIONS.find((s) => s.slug === first)?.slug ?? null;
}

export interface JourneyStep {
  /** 1-based, among visible sections. */
  index: number;
  total: number;
  prev: SectionDef | null;
  next: SectionDef | null;
}

export function journeyStep(current: SectionSlug | null, hidden: readonly string[]): JourneyStep | null {
  const sections = visibleSections(hidden);
  const at = sections.findIndex((s) => s.slug === current);
  if (at < 0) return null;
  return {
    index: at + 1,
    total: sections.length,
    prev: sections[at - 1] ?? null,
    next: sections[at + 1] ?? null,
  };
}

/** Four section slots; the fifth is More. */
const DOCK_SLOTS = 4;

/**
 * The phone dock's slots. The first four in journey order — unless you are
 * further along, in which case the section you are on takes the last slot:
 * a bar that can't show where you are is a bar that lies about it.
 */
export function dockSplit(
  sections: readonly SectionDef[],
  current: SectionSlug | null,
): { dock: SectionDef[]; more: SectionDef[] } {
  const dock = sections.slice(0, DOCK_SLOTS);
  const here = sections.find((s) => s.slug === current);
  if (here && !dock.includes(here)) dock[DOCK_SLOTS - 1] = here;
  return { dock, more: sections.filter((s) => !dock.includes(s)) };
}

export interface SectionCounts {
  resumes: number;
  questions: number;
  gaps: number;
  /** null before a roadmap is built (F21) — reads "—", not "0 of 0". */
  roadmapProgress: { done: number; total: number } | null;
  /** F26: decks, rounds and challenges started — "3 drills" before any. */
  drills: number;
  /** F29: the next round still ahead, already phrased ("Thu 16 Oct"), or null. */
  nextRound: string | null;
  /** F30: "6 sessions", "2h short" or "Set a date" — already phrased. */
  study: string;
}

/**
 * Each section's count, phrased. Rendered before a section is opened on
 * purpose: a surface that generated nothing is visible as empty from the bar.
 */
export function sectionCountLabels(counts: SectionCounts, generating: boolean): Record<SectionSlug, string> {
  // A zero while the stage is still writing would read as "generated nothing".
  const PENDING = "Preparing…";
  return {
    resumes: String(counts.resumes),
    prep: generating && counts.questions === 0 ? PENDING : String(counts.questions),
    learning: generating && counts.gaps === 0 ? PENDING : `${counts.gaps} gap${counts.gaps === 1 ? "" : "s"}`,
    schedule: counts.study,
    // N16: a count, never a percentage.
    roadmap: counts.roadmapProgress ? `${counts.roadmapProgress.done}/${counts.roadmapProgress.total}` : "—",
    rapid: counts.drills > 0 ? `${counts.drills} session${counts.drills === 1 ? "" : "s"}` : "3 drills",
    rounds: counts.nextRound ?? "Add one",
  };
}

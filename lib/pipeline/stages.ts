/**
 * The four named steps of the parsing screen (F3). PURE.
 *
 * Streamed with real per-stage state — never a fake timer. A spinner that lies
 * is worse than an error, so a stage failure stops there and says what failed.
 */

/**
 * `label` is the row in the stage list; `description` is the sentence shown
 * while that stage is the running one. The description says what the stage does
 * and, where it matters, what it refuses to do — the matching stage is the one
 * that decides what counts as evidence, and saying so here is cheaper than
 * defending the score later.
 */
export const STAGES = [
  {
    key: "reading",
    label: "Reading the posting",
    description:
      "Pulling the title, the responsibilities and every stated requirement out of the document — before anything is matched or rewritten.",
  },
  {
    key: "matching",
    label: "Matching against your profile",
    description:
      "Checking each requirement against your own words. Nothing counts as evidence unless one of your bullets actually says it.",
  },
  {
    key: "rewriting",
    label: "Rewriting your résumé",
    description:
      "Reordering and rewording your bullets against this posting. Every generated line keeps a key back to the bullet you wrote.",
  },
  {
    key: "preparing",
    label: "Preparing questions and courses",
    description:
      "Drawing the questions this posting invites, then matching what you can't evidence to courses from the vetted catalog.",
  },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];
export type StageState = "pending" | "running" | "done" | "failed" | "degraded";

export interface StageUpdate {
  stage: StageKey;
  state: StageState;
  /** 0–100 across the whole run. */
  progressPct: number;
  /** Present when state is 'failed' or 'degraded'. User-facing, no PII (N7). */
  message?: string;
}

export type StageEmitter = (update: StageUpdate) => void;

const PROGRESS: Record<StageKey, { start: number; end: number }> = {
  reading: { start: 0, end: 25 },
  matching: { start: 25, end: 45 },
  rewriting: { start: 45, end: 80 },
  preparing: { start: 80, end: 100 },
};

export function progressFor(stage: StageKey, state: StageState): number {
  const { start, end } = PROGRESS[stage];
  return state === "running" ? start : end;
}

/**
 * What `analyses.stage_state` can honestly say (G4). Written across three
 * places in the pipeline (`createAnalysis`'s injection scan, stage ①'s
 * usedRegions/truncated/protectedNotice) and read here in the one shape the
 * results header renders — a Json column is only as trustworthy as what
 * parses back out of it (CLAUDE.md §11).
 */
export interface AnalysisStageState {
  usedRegions: string[];
  truncated: boolean;
  protectedNotice: string | null;
  injection: string[];
}

export function readStageState(value: unknown): AnalysisStageState {
  const obj = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    usedRegions: Array.isArray(obj.usedRegions) ? obj.usedRegions.filter((r): r is string => typeof r === "string") : [],
    truncated: obj.truncated === true,
    protectedNotice: typeof obj.protectedNotice === "string" ? obj.protectedNotice : null,
    injection: Array.isArray(obj.injection) ? obj.injection.filter((p): p is string => typeof p === "string") : [],
  };
}

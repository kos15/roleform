/**
 * The four named steps of the parsing screen (F3). PURE.
 *
 * Streamed with real per-stage state — never a fake timer. A spinner that lies
 * is worse than an error, so a stage failure stops there and says what failed.
 */

export const STAGES = [
  { key: "reading", label: "Reading the posting" },
  { key: "matching", label: "Matching against your profile" },
  { key: "rewriting", label: "Rewriting your resume" },
  { key: "preparing", label: "Preparing questions and courses" },
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

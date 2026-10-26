/**
 * Past this age an unreleased claim is treated as abandoned rather than live
 * — longer than `maxDuration` (300s) on the route this runs behind, so a
 * claim only goes stale after an invocation that could not possibly still be
 * running has had time to be killed and its `finally` skipped.
 */
export const RUN_LOCK_STALE_MS = 6 * 60_000;

/**
 * Prep and Learning still generating behind a `ready` analysis.
 *
 * The run marks itself `ready` as soon as the drafts exist and keeps going for
 * ④ and ⑤; its claim (`runningAt`) is held until they finish. A tab whose rows
 * are missing shows a loader while this is true, and its ordinary empty state
 * once it is not. A claim past `RUN_LOCK_STALE_MS` belongs to an invocation
 * the platform killed, so it is not "still generating" — the tab offers to
 * pick the missing stage up instead.
 */
export function backgroundRunning(analysis: {
  status: string;
  runningAt: Date | null;
}): boolean {
  return (
    analysis.status === "ready" &&
    analysis.runningAt !== null &&
    analysis.runningAt.getTime() > Date.now() - RUN_LOCK_STALE_MS
  );
}

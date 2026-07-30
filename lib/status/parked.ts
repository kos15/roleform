import "server-only";
import { db } from "@/lib/db";
import { STAGES, type StageKey } from "@/lib/pipeline/stages";

/**
 * The run that stopped part-way (F14).
 *
 * Progress is not read from a progress field — there isn't one worth trusting
 * across a crashed request. It is counted from what the run actually managed to
 * persist: requirements mean reading finished, coverage items mean matching
 * finished, drafts mean rewriting finished, questions mean preparing finished.
 *
 * That makes the number on the status page a fact about rows in a table rather
 * than a guess about a worker, which is the only kind of progress bar worth
 * showing next to the word "parked".
 */

export interface ParkedRun {
  id: string;
  label: string;
  /** The first stage with no output yet — where the run picks back up. */
  resumesAt: StageKey;
  stageIndex: number;
  progressPct: number;
  startedAt: Date;
}

/** End of each stage's band, matching lib/pipeline/stages.ts. */
const BAND_END: Record<StageKey, number> = {
  reading: 25,
  matching: 45,
  rewriting: 80,
  preparing: 100,
};

export async function parkedRun(clerkUserId: string): Promise<ParkedRun | null> {
  const analysis = await db.analysis.findFirst({
    where: { clerkUserId, status: "parsing" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      company: true,
      title: true,
      createdAt: true,
      _count: {
        select: {
          jdRequirements: true,
          coverageItems: true,
          resumeDrafts: true,
          interviewQuestions: true,
        },
      },
    },
  });

  if (!analysis) return null;

  const done: Record<StageKey, boolean> = {
    reading: analysis._count.jdRequirements > 0,
    matching: analysis._count.coverageItems > 0,
    rewriting: analysis._count.resumeDrafts > 0,
    preparing: analysis._count.interviewQuestions > 0,
  };

  const firstUnfinished = STAGES.findIndex((s) => !done[s.key]);
  const stageIndex = firstUnfinished === -1 ? STAGES.length - 1 : firstUnfinished;
  const resumesAt = STAGES[stageIndex].key;

  // Credit only the stages that finished. A stage in flight contributes nothing,
  // because we cannot see inside it and rounding up would be an invention.
  const completed = STAGES.slice(0, stageIndex);
  const progressPct = completed.length === 0 ? 0 : BAND_END[completed[completed.length - 1].key];

  const label = [analysis.company, analysis.title].filter(Boolean).join(" · ") || "Your analysis";

  return {
    id: analysis.id,
    label,
    resumesAt,
    stageIndex,
    progressPct,
    startedAt: analysis.createdAt,
  };
}

import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { STAGES, type StageKey } from "@/lib/pipeline/stages";

/**
 * Per-stage pipeline health, derived from what actually ran (F14).
 *
 * The design's status screen reports one stage degraded while the rest keep
 * working. That is only worth showing if the words are true, so nothing here is
 * authored: each stage's state is read back out of `ai_runs` over the last hour.
 * A stage with no traffic reports Operational and says it has no traffic —
 * "unknown" dressed up as "healthy" is exactly the lie the screen exists to
 * avoid.
 *
 * The matching stage runs no model at all (lib/domain/coverage.ts is pure), so
 * it has no runs to read and no way to degrade on its own. It says so.
 */

export type StageHealth = "operational" | "degraded";

export interface StageStatus {
  key: StageKey;
  label: string;
  state: StageHealth;
  note: string;
}

/** Which AI purposes belong to which stage of the four-stage run. */
const PURPOSE_STAGE: Record<string, StageKey> = {
  extract_profile: "reading",
  analyze_jd: "reading",
  tailor_bullet: "rewriting",
  tailor_summary: "rewriting",
  interview_questions: "preparing",
  question_answer: "preparing",
  describe_gaps: "preparing",
};

/** Below this, the sample is too small to call anything — we say so instead. */
const MIN_SAMPLE = 5;
/** A fifth of calls coming back schema-invalid is a degraded worker, not noise. */
const INVALID_RATE = 0.2;
/** Averaging a corrective retry per call means the model is struggling. */
const RETRY_MEAN = 1;

const WINDOW_MINUTES = 60;

async function readHealth(): Promise<StageStatus[]> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);

  // N7: counts and aggregates only — no clerk subject, no analysis id, nothing
  // that ties a health number back to a person.
  let rows: { purpose: string; schemaValid: boolean; retryCount: number }[] = [];
  try {
    rows = await db.aiRun.findMany({
      where: { createdAt: { gte: since } },
      select: { purpose: true, schemaValid: true, retryCount: true },
    });
  } catch {
    // The status page must survive the database being the thing that is down.
    return STAGES.map((s) => ({
      key: s.key,
      label: s.label,
      state: "degraded" as const,
      note: "We can't read health for this stage right now.",
    }));
  }

  const tally = new Map<StageKey, { total: number; invalid: number; retries: number }>();
  for (const row of rows) {
    const stage = PURPOSE_STAGE[row.purpose];
    if (!stage) continue;
    const t = tally.get(stage) ?? { total: 0, invalid: 0, retries: 0 };
    t.total += 1;
    if (!row.schemaValid) t.invalid += 1;
    t.retries += row.retryCount;
    tally.set(stage, t);
  }

  return STAGES.map((stage) => {
    if (stage.key === "matching") {
      return {
        key: stage.key,
        label: stage.label,
        state: "operational" as const,
        note: "Coverage and requirement scoring are deterministic and run in-process — there is no worker here to degrade.",
      };
    }

    const t = tally.get(stage.key);
    if (!t || t.total < MIN_SAMPLE) {
      return {
        key: stage.key,
        label: stage.label,
        state: "operational" as const,
        note: `No failures reported. Fewer than ${MIN_SAMPLE} runs in the last hour, so this is a quiet stage rather than a verified one.`,
      };
    }

    const invalidRate = t.invalid / t.total;
    const retryMean = t.retries / t.total;
    const degraded = invalidRate >= INVALID_RATE || retryMean >= RETRY_MEAN;

    return {
      key: stage.key,
      label: stage.label,
      state: degraded ? ("degraded" as const) : ("operational" as const),
      note: degraded
        ? `${Math.round(invalidRate * 100)}% of the last ${t.total} runs came back malformed and had to be retried. Runs queue and resume rather than failing.`
        : `${t.total} runs in the last hour, ${Math.round((1 - invalidRate) * 100)}% valid first time.`,
    };
  });
}

/**
 * Cached for a minute. The footer renders this on every page; a per-request
 * aggregate over ai_runs to draw one dot is not a trade worth making.
 */
export const pipelineHealth = unstable_cache(readHealth, ["pipeline-health"], {
  revalidate: 60,
  tags: ["pipeline-health"],
});

export function anyDegraded(stages: StageStatus[]): boolean {
  return stages.some((s) => s.state === "degraded");
}

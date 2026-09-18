"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, checkRoadmapAllowance } from "@/lib/auth";
import { getAnalysis } from "@/lib/db/queries/analysis";
import { createRoadmap, getRoadmap, roadmapExists } from "@/lib/db/queries/roadmap";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/**
 * Building a roadmap (F21).
 *
 * On demand, one click, zero model calls (N13, RM-1) — `ai_runs` does not
 * move. The cap (`checkRoadmapAllowance`) is checked before the compile, the
 * same "refused before any work starts" shape every other seam in this
 * product uses; there is nothing to refund here even so, since compiling
 * costs nothing to have started.
 */
export async function buildRoadmap(analysisId: string): Promise<Result<{ roadmapId: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const analysis = await getAnalysis(user.value, analysisId);
  if (!analysis) return err(appError("not_found", "We couldn't find that analysis."));
  if (analysis.status !== "ready") {
    return err(appError("invalid_input", "This analysis isn't finished yet."));
  }

  // RM-4: one roadmap per analysis, ever (the unique index on analysis_id is
  // the actual guarantee) — a second click reads the existing one back
  // rather than trying to build again, which would also mean not paying a
  // second time against a Free member's one-a-cycle cap for a rebuild they
  // never asked for.
  if (await roadmapExists(user.value, analysisId)) {
    const existing = await getRoadmap(user.value, analysisId);
    if (existing) return ok({ roadmapId: existing.id });
  }

  const allowance = await checkRoadmapAllowance(user.value);
  if (!allowance.ok) return allowance;

  const roadmapId = await createRoadmap(user.value, analysisId);

  revalidatePath(`/analysis/${analysisId}`);
  revalidatePath(`/analysis/${analysisId}/roadmap`);
  return ok({ roadmapId });
}

/**
 * Ticking a step (N15) — the ONLY way `done_at` is ever written. Nothing
 * derived, scheduled or model-written sets it; a fact the app can see (an
 * export exists, an answer was drafted) is a hint shown beside the row,
 * never a substitute for the user's own tick.
 */
export async function setRoadmapItemDone(itemId: string, done: boolean): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const updated = await db.roadmapItem.updateMany({
    where: { id: itemId, clerkUserId: user.value },
    data: { doneAt: done ? new Date() : null },
  });
  if (updated.count === 0) return err(appError("not_found", "That step isn't on your roadmap."));

  return ok(null);
}

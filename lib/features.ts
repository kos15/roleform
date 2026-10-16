import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { appError, err, ok, type Result } from "@/lib/domain/types";
import { FEATURES, type FeatureKey } from "@/lib/domain/features";

/**
 * Site-wide feature switches (F31).
 *
 * A missing row is ON — a fresh database has every surface open, and an admin
 * only ever writes the exceptions. A read failure is also ON: a switch exists
 * to close a surface on purpose, and a database hiccup is not a purpose.
 *
 * Not per plan (N22). "Who may use job search" is still `cap_job_searches`;
 * this answers "is job search open on this deployment at all".
 */
export const featureStates = cache(async (): Promise<Record<FeatureKey, boolean>> => {
  const states = Object.fromEntries(FEATURES.map((f) => [f.key, true])) as Record<FeatureKey, boolean>;
  try {
    const rows = await db.featureSwitch.findMany();
    for (const row of rows) states[row.key] = row.enabled;
  } catch {
    // Fail open — see above.
  }
  return states;
});

export async function featureEnabled(key: FeatureKey): Promise<boolean> {
  return (await featureStates())[key];
}

/** For a page: a switched-off surface is a plain 404, not a broken screen. */
export async function requireFeaturePage(key: FeatureKey): Promise<void> {
  if (!(await featureEnabled(key))) notFound();
}

/** For a Server Action: the page may be cached open in a tab; the action is the lock. */
export async function requireFeature(key: FeatureKey): Promise<Result<true>> {
  if (await featureEnabled(key)) return ok(true);
  const label = FEATURES.find((f) => f.key === key)?.label ?? "This feature";
  return err(appError("feature_off", `${label} is switched off on Roleform right now.`));
}

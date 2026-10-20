import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { PLANS, formatPrice, planAbove, type Plan, type PlanId } from "@/lib/content/pricing";
import type { QuotaKey } from "@/lib/domain/quotas";

/**
 * The live plan catalog (F31).
 *
 * `lib/content/pricing.ts` holds the defaults; `plan_configs` holds whatever an
 * admin has saved over them. Every surface that prints or charges a price —
 * /pricing, its Markdown mirror, checkout, the Razorpay webhook, the token and
 * cap walls, the admin panel — reads it here, so what is printed and what is
 * charged come from one row (N21's "captured payment of the right amount" is
 * the amount in this row).
 *
 * A read failure falls back to the defaults rather than failing the page: a
 * pricing page that 500s is worse than one quoting the shipped numbers, and
 * the webhook compares against the same fallback, so the two still agree.
 */
export const loadPlans = cache(async (): Promise<Plan[]> => {
  let rows: Awaited<ReturnType<typeof db.planConfig.findMany>> = [];
  try {
    rows = await db.planConfig.findMany();
  } catch {
    return PLANS;
  }
  return PLANS.map((fallback) => {
    const row = rows.find((r) => r.id === fallback.id);
    if (!row) return fallback;
    return {
      ...fallback,
      name: row.name,
      pricePaise: row.pricePaise,
      price: formatPrice(row.pricePaise),
      unit: row.unit,
      tagline: row.tagline,
      cta: row.cta,
      featured: row.featured,
      caps: {
        tokens: row.capTokens,
        analyses: row.capAnalyses,
        resumes: row.capResumes,
        answers: row.capAnswers,
        courses: row.capCourses,
        roadmaps: row.capRoadmaps,
        jobSearches: row.capJobSearches,
        practice: row.capPractice,
      },
    };
  });
});

export async function loadPlan(id: PlanId): Promise<Plan> {
  const plans = await loadPlans();
  return plans.find((p) => p.id === id) ?? PLANS.find((p) => p.id === id)!;
}

export async function loadPlanAbove(id: PlanId): Promise<Plan | null> {
  return planAbove(id, await loadPlans());
}

/** The seven `users.cap_*` columns a plan's caps become on an account. */
export function capColumns(caps: Record<QuotaKey, number>) {
  return {
    capTokens: caps.tokens,
    capAnalyses: caps.analyses,
    capResumes: caps.resumes,
    capAnswers: caps.answers,
    capCourses: caps.courses,
    capRoadmaps: caps.roadmaps,
    capJobSearches: caps.jobSearches,
    capPractice: caps.practice,
  };
}

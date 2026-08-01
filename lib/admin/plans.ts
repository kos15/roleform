/**
 * What the public pricing page promises, measured against what this workspace
 * actually holds (F17). PURE — it takes rows, not a database.
 *
 * The pricing page publishes four caps per plan, and an admin can move any
 * member's caps off those numbers from the panel above. Both of those are
 * correct on their own and wrong together in silence: the page keeps saying
 * "40 analyses" while a member on that plan is sitting at 5.
 *
 * So the admin surface reports the drift rather than restating the price list.
 * `overridden` is the only number here that isn't already on /pricing, and it
 * is the one an admin can act on.
 */

import { PLANS, type Plan, type PlanId } from "@/lib/content/pricing";
import { QUOTAS, type QuotaKey } from "@/lib/domain/quotas";

export interface PlanRollup {
  plan: Plan;
  /** Accounts on this plan right now. */
  members: number;
  /** Of those, how many carry at least one cap the plan does not publish. */
  overridden: number;
}

export interface PlanMember {
  planId: PlanId;
  caps: Record<QuotaKey, number>;
}

export function rollUpPlans(members: PlanMember[]): PlanRollup[] {
  return PLANS.map((plan) => {
    const on = members.filter((m) => m.planId === plan.id);
    return {
      plan,
      members: on.length,
      overridden: on.filter((m) => QUOTAS.some((q) => m.caps[q.key] !== plan.caps[q.key])).length,
    };
  });
}

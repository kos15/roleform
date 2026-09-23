import Link from "next/link";
import { Tag } from "@/components/ui";
import { displayCap, QUOTAS } from "@/lib/domain/quotas";
import type { PlanRollup } from "@/lib/admin/plans";

/**
 * Plans, at the foot of the admin panel (F15/F17) — the design's "Plans &
 * coupons" strip, minus the coupons.
 *
 * The four numbers on each card are read from the same `PLANS` table
 * /pricing renders, so this panel cannot quote a member a cap the public page
 * doesn't sell. Nothing here is editable: caps are edited per member in the
 * panel above, or for the next signup under Workspace defaults, and a third
 * control writing the same columns is a third place for them to disagree.
 *
 * The one thing this panel knows that /pricing doesn't is how far the workspace
 * has already moved off the published numbers — that is the `overridden` line,
 * and it appears only when it has something to report.
 *
 * **No coupon rows.** The design shows four; we have no redemption seam, no
 * table and nothing that would honour a code at the point of payment, and a
 * coupon list an admin can toggle that changes nobody's bill is exactly the
 * decorative surface the rest of this product refuses to ship.
 */
export function PlansPanel({ rollup }: { rollup: PlanRollup[] }) {
  return (
    <section className="mt-9 border-t border-[var(--color-line)] pt-7">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[56ch]">
          <h2 className="mb-1.5 text-[1.5rem]">Plans</h2>
          <p className="text-[0.85rem] leading-relaxed text-[var(--color-text-muted)]">
            A plan is the four caps an account inherits when it lands on one. The panel above moves
            an individual member off those numbers; this is what the public page is promising
            everyone else.
          </p>
        </div>
        <Link href="/pricing" className="btn btn-secondary btn-sm no-underline">
          See the public page
        </Link>
      </div>

      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
        {rollup.map(({ plan, members, overridden }) => (
          <div
            key={plan.id}
            className="rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)] p-[1.125rem_1.25rem]"
          >
            <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
              <span className="display text-[1.1875rem]">
                {plan.name}
              </span>
              <Tag tone="muted">
                {members} {members === 1 ? "account" : "accounts"}
              </Tag>
            </div>

            <div className="mb-3 flex items-baseline gap-[7px]">
              <span className="display text-[1.625rem] leading-none">
                {plan.price}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">{plan.unit}</span>
            </div>

            <dl className="flex flex-col gap-1.5 border-t border-[var(--color-line)] pt-3">
              {QUOTAS.map((quota) => (
                <div key={quota.key} className="flex items-baseline justify-between gap-3 text-xs">
                  <dt className="text-[var(--color-text-muted)]">{quota.label}</dt>
                  <dd className="font-semibold tabular-nums">
                    {displayCap(quota.key, plan.caps[quota.key])}
                    <span className="ml-1 font-normal text-[var(--color-text-muted)]">
                      {quota.unit}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>

            {overridden > 0 ? (
              <p className="mt-3 border-t border-[var(--color-line)] pt-3 text-[11.5px] leading-snug text-[var(--color-text-muted)]">
                {overridden} of these {overridden === 1 ? "carries a cap" : "carry caps"} this plan
                doesn&rsquo;t publish. Their own row is what the product enforces; these four are
                what the public page still promises everyone else.
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <p className="mt-3.5 text-xs text-[var(--color-text-muted)]">
        Caps are changed per member above, or for the next account under Workspace defaults. Moving
        a member never removes work they have already generated.
      </p>
    </section>
  );
}

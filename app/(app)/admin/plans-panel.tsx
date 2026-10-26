"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { resetPlanConfig, savePlanConfig } from "@/app/actions/admin-controls";
import { Button, ErrorRegion, Tag } from "@/components/ui";
import { clampCap, displayCap, QUOTAS, type QuotaKey } from "@/lib/domain/quotas";
import type { Plan } from "@/lib/content/pricing";
import type { PlanRollup } from "@/lib/admin/plans";

/**
 * The public plan catalog, editable (F31).
 *
 * What is saved here is what /pricing prints and what checkout charges from
 * the next order on — one row, read by both (lib/services/plans/catalog.ts). Saving
 * never moves an existing member: their caps are their own row, edited from
 * Members; a paid member picks up new caps when they next renew.
 *
 * Still no "features" column: a plan IS its caps (N22). Whole surfaces are
 * opened or closed for everyone under Features.
 */
export function PlansPanel({ plans, rollup }: { plans: Plan[]; rollup: PlanRollup[] }) {
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[60ch]">
          <h2 className="mb-1.5 text-[1.5rem]">Plans</h2>
          <p className="text-[0.85rem] leading-relaxed text-[var(--color-text-muted)]">
            Edit what the public pricing page sells. A saved price is what the next checkout
            charges; saved caps are what the next purchase writes onto an account. Nobody already
            on a plan is moved — use Members for that.
          </p>
        </div>
        <Link href="/pricing" className="btn btn-secondary btn-sm no-underline" target="_blank">
          Open the public page
        </Link>
      </div>

      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
        {plans.map((plan) => (
          <PlanEditor key={plan.id} plan={plan} rollup={rollup.find((r) => r.plan.id === plan.id)} />
        ))}
      </div>
    </section>
  );
}

function PlanEditor({ plan, rollup }: { plan: Plan; rollup?: PlanRollup }) {
  const [name, setName] = useState(plan.name);
  const [rupees, setRupees] = useState(String(plan.pricePaise / 100));
  const [unit, setUnit] = useState(plan.unit);
  const [tagline, setTagline] = useState(plan.tagline);
  const [cta, setCta] = useState(plan.cta);
  const [featured, setFeatured] = useState(Boolean(plan.featured));
  const [caps, setCaps] = useState<Record<QuotaKey, number>>(plan.caps);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const free = plan.id === "free";

  function save() {
    setError(null);
    setSaved(false);
    const pricePaise = free ? 0 : Math.round(Number(rupees) * 100);
    if (!free && (!Number.isFinite(pricePaise) || pricePaise < 100)) {
      setError("Price has to be at least ₹1.");
      return;
    }
    startTransition(async () => {
      const result = await savePlanConfig({
        id: plan.id,
        name,
        pricePaise,
        unit,
        tagline,
        cta,
        featured,
        caps,
      });
      if (!result.ok) setError(result.error.message);
      else setSaved(true);
    });
  }

  function reset() {
    setError(null);
    startTransition(async () => {
      const result = await resetPlanConfig(plan.id);
      if (!result.ok) setError(result.error.message);
      else window.location.reload();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)] p-[1.125rem_1.25rem]">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="display text-[1.1875rem]">{plan.name}</span>
        <Tag tone="muted">
          {rollup?.members ?? 0} {rollup?.members === 1 ? "account" : "accounts"}
        </Tag>
        {featured ? <Tag tone="accent">Featured</Tag> : null}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="field col-span-2 text-xs">
          <span>Name</span>
          <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field text-xs">
          <span>Price (₹)</span>
          <input
            className="input"
            type="number"
            min={free ? 0 : 1}
            step="1"
            inputMode="decimal"
            value={free ? "0" : rupees}
            disabled={free}
            onChange={(e) => setRupees(e.target.value)}
          />
        </label>
        <label className="field text-xs">
          <span>Billing unit</span>
          <input className="input" value={unit} maxLength={40} onChange={(e) => setUnit(e.target.value)} />
        </label>
        <label className="field col-span-2 text-xs">
          <span>Tagline</span>
          <textarea
            className="input min-h-[84px]"
            value={tagline}
            maxLength={400}
            onChange={(e) => setTagline(e.target.value)}
          />
        </label>
        <label className="field text-xs">
          <span>Button text</span>
          <input className="input" value={cta} maxLength={40} onChange={(e) => setCta(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-xs font-semibold">
          <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
          Featured card
        </label>
      </div>

      <dl className="flex flex-col gap-2 border-t border-[var(--color-line)] pt-3">
        {QUOTAS.map((quota) => (
          <div key={quota.key} className="flex items-center justify-between gap-3 text-xs">
            <dt className="text-[var(--color-text-muted)]">
              {quota.label}
              <span className="ml-1 opacity-75">({quota.unit})</span>
            </dt>
            <dd className="flex items-center gap-1.5">
              <input
                className="input w-[110px] py-1 text-right tabular-nums"
                type="number"
                min={quota.min}
                max={quota.max}
                step={quota.step}
                value={caps[quota.key]}
                aria-label={`${plan.name} ${quota.label}`}
                onChange={(e) =>
                  setCaps((c) => ({ ...c, [quota.key]: clampCap(quota.key, Number(e.target.value) || 0) }))
                }
              />
              <span className="w-[52px] text-right font-semibold tabular-nums">
                {displayCap(quota.key, caps[quota.key])}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      {rollup && rollup.overridden > 0 ? (
        <p className="text-[11.5px] leading-snug text-[var(--color-text-muted)]">
          {rollup.overridden} of these {rollup.overridden === 1 ? "account carries a cap" : "accounts carry caps"} this
          plan doesn&rsquo;t publish.
        </p>
      ) : null}

      {error ? <ErrorRegion title="That didn't save">{error}</ErrorRegion> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} busy={pending} disabled={pending}>
          {saved ? "Saved" : "Save plan"}
        </Button>
        <Button size="sm" variant="ghost" onClick={reset} disabled={pending}>
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}

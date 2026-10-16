"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPromo, deletePromo, updatePromo } from "@/app/actions/admin-controls";
import { Button, ErrorRegion, Tag } from "@/components/ui";
import { formatPrice, type Plan } from "@/lib/content/pricing";
import { discountedPaise, generateCode } from "@/lib/domain/promo";
import type { AdminPromo } from "@/lib/promo/server";

/**
 * Promo codes (F32): generate, list, pause, take off the banner.
 *
 * A code's discount is fixed once created — changing what a code is worth
 * after people have been told it would make the banner a bait and switch.
 * Pause it and make another instead.
 */
const STATE_TONE: Record<AdminPromo["state"], "sage" | "muted" | "accent" | "warn"> = {
  live: "sage",
  scheduled: "muted",
  paused: "warn",
  ended: "muted",
  "used-up": "accent",
};

export function PromosPanel({ promos, plans }: { promos: AdminPromo[]; plans: Plan[] }) {
  const router = useRouter();
  const paid = plans.filter((p) => p.pricePaise > 0);

  const [label, setLabel] = useState("Diwali offer");
  // Generated after mount: a random code rendered on the server would never
  // match the one the browser hydrates with.
  const [code, setCode] = useState("");
  useEffect(() => setCode(generateCode("DIWALI")), []);
  const [kind, setKind] = useState<"percent" | "flat">("percent");
  const [percent, setPercent] = useState("20");
  const [flat, setFlat] = useState("100");
  const [forPlans, setForPlans] = useState<string[]>(paid.map((p) => p.id));
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [max, setMax] = useState("");
  const [showBanner, setShowBanner] = useState(true);
  const [bannerText, setBannerText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const discount =
    kind === "percent"
      ? { kind: "percent" as const, percentOff: Math.max(1, Math.min(90, Number(percent) || 0)) }
      : { kind: "flat" as const, amountOffPaise: Math.max(100, Math.round((Number(flat) || 0) * 100)) };

  function create() {
    setError(null);
    setCreated(null);
    startTransition(async () => {
      const result = await createPromo({
        code,
        label,
        kind,
        percentOff: discount.kind === "percent" ? discount.percentOff : undefined,
        amountOffPaise: discount.kind === "flat" ? discount.amountOffPaise : undefined,
        plans: forPlans as ("pro" | "ultra")[],
        startsAt: startsAt || undefined,
        endsAt: endsAt || undefined,
        maxRedemptions: max ? Number(max) : undefined,
        showBanner,
        bannerText: bannerText.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setCreated(result.value.code);
      setCode(generateCode(label.split(/\s+/)[0] ?? "FEST"));
      router.refresh();
    });
  }

  function patch(id: string, data: { active?: boolean; showBanner?: boolean }) {
    setError(null);
    startTransition(async () => {
      const result = await updatePromo({ id, ...data });
      if (!result.ok) setError(result.error.message);
      router.refresh();
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deletePromo(id);
      if (!result.ok) setError(result.error.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)] p-[clamp(1.125rem,3vw,1.5rem)]">
        <div className="mb-4 max-w-[62ch]">
          <h3 className="mb-1.5">New promo code</h3>
          <p className="text-[0.85rem] leading-relaxed text-[var(--color-text-muted)]">
            Discounts a plan at checkout. Each member can use a code once. While a code is live
            and on the banner, it scrolls across the top of the home page and every analysis page.
          </p>
        </div>

        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
          <label className="field text-xs">
            <span>Offer name</span>
            <input className="input" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="field text-xs">
            <span>Code</span>
            <div className="flex gap-2">
              <input
                className="input min-w-0 flex-1 uppercase"
                value={code}
                maxLength={24}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm flex-none"
                onClick={() => setCode(generateCode(label.split(/\s+/)[0] ?? "FEST"))}
              >
                Generate
              </button>
            </div>
          </label>
          <div className="field text-xs">
            <span>Discount</span>
            <div className="flex gap-2">
              <select
                className="input flex-none"
                value={kind}
                aria-label="Discount type"
                onChange={(e) => setKind(e.target.value as "percent" | "flat")}
              >
                <option value="percent">% off</option>
                <option value="flat">₹ off</option>
              </select>
              {kind === "percent" ? (
                <input
                  className="input min-w-0 flex-1"
                  type="number"
                  min={1}
                  max={90}
                  value={percent}
                  aria-label="Percent off"
                  onChange={(e) => setPercent(e.target.value)}
                />
              ) : (
                <input
                  className="input min-w-0 flex-1"
                  type="number"
                  min={1}
                  value={flat}
                  aria-label="Rupees off"
                  onChange={(e) => setFlat(e.target.value)}
                />
              )}
            </div>
          </div>
          <div className="field text-xs">
            <span>Applies to</span>
            <div className="flex flex-wrap gap-3 pt-2">
              {paid.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5 font-semibold">
                  <input
                    type="checkbox"
                    checked={forPlans.includes(p.id)}
                    onChange={(e) =>
                      setForPlans((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id)))
                    }
                  />
                  {p.name}{" "}
                  <span className="font-normal text-[var(--color-text-muted)]">
                    {formatPrice(discountedPaise(p.pricePaise, discount))}{" "}
                    <s>{p.price}</s>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <label className="field text-xs">
            <span>Starts (blank = now)</span>
            <input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label className="field text-xs">
            <span>Ends (blank = no end)</span>
            <input className="input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
          <label className="field text-xs">
            <span>Max redemptions (blank = unlimited)</span>
            <input className="input" type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} />
          </label>
          <label className="field text-xs">
            <span>Banner text (optional)</span>
            <input
              className="input"
              value={bannerText}
              maxLength={160}
              placeholder={`${label}: ${kind === "percent" ? `${percent}% off` : `₹${flat} off`} with code ${code}`}
              onChange={(e) => setBannerText(e.target.value)}
            />
          </label>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={showBanner} onChange={(e) => setShowBanner(e.target.checked)} />
          Show in the scrolling banner while live
        </label>

        {error ? (
          <div className="mt-3">
            <ErrorRegion title="That didn't go through">{error}</ErrorRegion>
          </div>
        ) : null}
        {created ? (
          <p className="mt-3 text-sm font-semibold">
            {created} is created. Share it, or link people to /pricing?promo={created}.
          </p>
        ) : null}

        <div className="mt-4">
          <Button onClick={create} busy={pending} disabled={pending || forPlans.length === 0}>
            Create code
          </Button>
        </div>
      </section>

      <section>
        <h3 className="mb-3">Codes</h3>
        {promos.length === 0 ? (
          <p className="text-[0.9rem] text-[var(--color-text-muted)]">No codes yet.</p>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)]">
            {promos.map((promo) => (
              <div
                key={promo.id}
                className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] px-4 py-3.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1 basis-60">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-[0.95rem] font-bold">{promo.code}</code>
                    <Tag tone={STATE_TONE[promo.state]}>{promo.state.replace("-", " ")}</Tag>
                    {promo.showBanner && promo.state === "live" ? <Tag tone="pink">On banner</Tag> : null}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {promo.label} · {promo.discount} · {promo.plans.join(", ")}
                  </div>
                  <div className="text-[11px] text-[var(--color-text-muted)]">
                    {promo.startsAt}
                    {promo.endsAt ? ` → ${promo.endsAt}` : " → no end"} · {promo.captured}
                    {promo.maxRedemptions ? ` of ${promo.maxRedemptions}` : ""} used
                    {promo.pending > 0 ? ` · ${promo.pending} checkout${promo.pending === 1 ? "" : "s"} opened` : ""} ·{" "}
                    {formatPrice(promo.revenuePaise)} taken
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => patch(promo.id, { active: !promo.active })}>
                    {promo.active ? "Pause" : "Resume"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => patch(promo.id, { showBanner: !promo.showBanner })}
                  >
                    {promo.showBanner ? "Hide banner" : "Show banner"}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(promo.id)}>
                    {promo.captured + promo.pending > 0 ? "Retire" : "Delete"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

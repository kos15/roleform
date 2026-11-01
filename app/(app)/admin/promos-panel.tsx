"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPromo, deletePromo, editPromo, updatePromo, type PromoInput } from "@/app/actions/admin-controls";
import { Button, ErrorRegion, Tag } from "@/components/ui";
import { formatPrice, type Plan } from "@/lib/content/pricing";
import { MAX_TRIAL_DAYS, discountedPaise, generateCode } from "@/lib/domain/promo";
import type { AdminPromo } from "@/lib/services/promo/server";

/**
 * Promo codes (F32, F32.1): create, edit, pause, take off the banner.
 *
 * Every field is the admin's to set — the code itself, the offer (% off, ₹ off
 * or an N-day free trial), the plans, the window, the limit and the banner
 * wording — and every field can be edited later. Once anyone has used a code
 * (or opened a checkout with it), the code, the offer and the plans lock:
 * changing what a code is worth after people were told would make the banner
 * a bait and switch. The server enforces the same lock (`editPromo`).
 */
const STATE_TONE: Record<AdminPromo["state"], "sage" | "muted" | "accent" | "warn"> = {
  live: "sage",
  scheduled: "muted",
  paused: "warn",
  ended: "muted",
  "used-up": "accent",
};

type Kind = "percent" | "flat" | "trial";

interface FormValues {
  label: string;
  code: string;
  kind: Kind;
  percent: string;
  flat: string;
  trialDays: string;
  plans: string[];
  startsAt: string;
  endsAt: string;
  max: string;
  showBanner: boolean;
  bannerText: string;
}

function blank(paid: Plan[]): FormValues {
  return {
    label: "Festive offer",
    code: "",
    kind: "percent",
    percent: "20",
    flat: "100",
    trialDays: "3",
    plans: paid.map((p) => p.id),
    startsAt: "",
    endsAt: "",
    max: "",
    showBanner: true,
    bannerText: "",
  };
}

function fromPromo(promo: AdminPromo): FormValues {
  return {
    label: promo.label,
    code: promo.code,
    kind: promo.kind,
    percent: String(promo.percentOff ?? 20),
    flat: String((promo.amountOffPaise ?? 10_000) / 100),
    trialDays: String(promo.trialDays ?? 3),
    plans: promo.plans,
    startsAt: promo.startsAtInput,
    endsAt: promo.endsAtInput,
    max: promo.maxRedemptions ? String(promo.maxRedemptions) : "",
    showBanner: promo.showBanner,
    bannerText: promo.bannerText ?? "",
  };
}

function toInput(v: FormValues): PromoInput {
  const percentOff = Math.max(1, Math.min(90, Math.round(Number(v.percent) || 0)));
  const amountOffPaise = Math.max(100, Math.round((Number(v.flat) || 0) * 100));
  const trialDays = Math.max(1, Math.min(MAX_TRIAL_DAYS, Math.round(Number(v.trialDays) || 0)));
  return {
    code: v.code,
    label: v.label,
    kind: v.kind,
    percentOff: v.kind === "percent" ? percentOff : undefined,
    amountOffPaise: v.kind === "flat" ? amountOffPaise : undefined,
    trialDays: v.kind === "trial" ? trialDays : undefined,
    plans: v.plans as ("pro" | "ultra")[],
    startsAt: v.startsAt || undefined,
    endsAt: v.endsAt || undefined,
    maxRedemptions: v.max ? Math.max(1, Math.round(Number(v.max))) : undefined,
    showBanner: v.showBanner,
    bannerText: v.bannerText.trim() || undefined,
  };
}

function offerText(v: FormValues): string {
  if (v.kind === "trial") return `try it free for ${v.trialDays} day${v.trialDays === "1" ? "" : "s"}`;
  return v.kind === "percent" ? `${v.percent}% off` : `₹${v.flat} off`;
}

/**
 * The form, shared by "New promo code" and each code's "Edit". `locked` greys
 * out the code, the offer and the plans on a code people have already used.
 */
function PromoForm({
  paid,
  initial,
  locked = false,
  submitLabel,
  onSubmit,
  onCancel,
  pending,
}: {
  paid: Plan[];
  initial: FormValues;
  locked?: boolean;
  submitLabel: string;
  onSubmit: (values: FormValues) => void;
  onCancel?: () => void;
  pending: boolean;
}) {
  const [v, setV] = useState<FormValues>(initial);
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setV((cur) => ({ ...cur, [key]: value }));

  // A new code is generated after mount: a random code rendered on the server
  // would never match the one the browser hydrates with.
  useEffect(() => {
    if (!initial.code) set("code", generateCode(initial.label.split(/\s+/)[0] ?? "FEST"));
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A trial grants exactly one plan. Switching to trial keeps the first ticked.
  function setKind(kind: Kind) {
    setV((cur) => ({ ...cur, kind, plans: kind === "trial" ? cur.plans.slice(0, 1) : cur.plans }));
  }

  function togglePlan(id: string, on: boolean) {
    setV((cur) => {
      if (cur.kind === "trial") return { ...cur, plans: on ? [id] : [] };
      return { ...cur, plans: on ? [...cur.plans, id] : cur.plans.filter((x) => x !== id) };
    });
  }

  const input = toInput(v);
  const paidDiscount =
    input.kind === "percent"
      ? { kind: "percent" as const, percentOff: input.percentOff! }
      : input.kind === "flat"
        ? { kind: "flat" as const, amountOffPaise: input.amountOffPaise! }
        : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      {locked ? (
        <p className="mb-3 text-xs font-semibold text-[var(--color-text-muted)]">
          People have used this code, so the code, the offer and the plans are locked. Everything else can change.
        </p>
      ) : null}

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
        <label className="field text-xs">
          <span>Offer name</span>
          <input className="input" value={v.label} maxLength={60} required onChange={(e) => set("label", e.target.value)} />
        </label>
        <label className="field text-xs">
          <span>Code (type your own, or generate)</span>
          <div className="flex gap-2">
            <input
              className="input min-w-0 flex-1 uppercase"
              value={v.code}
              maxLength={24}
              disabled={locked}
              required
              onChange={(e) => set("code", e.target.value.toUpperCase())}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm flex-none"
              disabled={locked}
              onClick={() => set("code", generateCode(v.label.split(/\s+/)[0] ?? "FEST"))}
            >
              Generate
            </button>
          </div>
        </label>
        <div className="field text-xs">
          <span>Offer</span>
          <div className="flex gap-2">
            <select
              className="input flex-none"
              value={v.kind}
              disabled={locked}
              aria-label="Offer type"
              onChange={(e) => setKind(e.target.value as Kind)}
            >
              <option value="percent">% off</option>
              <option value="flat">₹ off</option>
              <option value="trial">Free trial (days)</option>
            </select>
            {v.kind === "percent" ? (
              <input
                className="input min-w-0 flex-1"
                type="number"
                min={1}
                max={90}
                value={v.percent}
                disabled={locked}
                aria-label="Percent off"
                onChange={(e) => set("percent", e.target.value)}
              />
            ) : v.kind === "flat" ? (
              <input
                className="input min-w-0 flex-1"
                type="number"
                min={1}
                value={v.flat}
                disabled={locked}
                aria-label="Rupees off"
                onChange={(e) => set("flat", e.target.value)}
              />
            ) : (
              <input
                className="input min-w-0 flex-1"
                type="number"
                min={1}
                max={MAX_TRIAL_DAYS}
                value={v.trialDays}
                disabled={locked}
                aria-label="Trial days"
                onChange={(e) => set("trialDays", e.target.value)}
              />
            )}
          </div>
        </div>
        <div className="field text-xs">
          <span>{v.kind === "trial" ? "Plan the trial gives (one)" : "Applies to"}</span>
          <div className="flex flex-wrap gap-3 pt-2">
            {paid.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 font-semibold">
                <input
                  type={v.kind === "trial" ? "radio" : "checkbox"}
                  name="promo-plan"
                  disabled={locked}
                  checked={v.plans.includes(p.id)}
                  onChange={(e) => togglePlan(p.id, e.target.checked)}
                />
                {p.name}{" "}
                <span className="font-normal text-[var(--color-text-muted)]">
                  {paidDiscount ? (
                    <>
                      {formatPrice(discountedPaise(p.pricePaise, paidDiscount))} <s>{p.price}</s>
                    </>
                  ) : (
                    <>free, then {p.price}</>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
        <label className="field text-xs">
          <span>Starts (blank = now, India time)</span>
          <input className="input" type="datetime-local" value={v.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
        </label>
        <label className="field text-xs">
          <span>Ends (blank = no end)</span>
          <input className="input" type="datetime-local" value={v.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
        </label>
        <label className="field text-xs">
          <span>Max uses across everyone (blank = unlimited)</span>
          <input className="input" type="number" min={1} value={v.max} onChange={(e) => set("max", e.target.value)} />
        </label>
        <label className="field text-xs">
          <span>Banner text (optional)</span>
          <input
            className="input"
            value={v.bannerText}
            maxLength={160}
            placeholder={`${v.label}: ${offerText(v)} with code ${v.code}`}
            onChange={(e) => set("bannerText", e.target.value)}
          />
        </label>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={v.showBanner} onChange={(e) => set("showBanner", e.target.checked)} />
        Show in the scrolling banner while live
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" busy={pending} disabled={pending || v.plans.length === 0}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function PromosPanel({ promos, plans }: { promos: AdminPromo[]; plans: Plan[] }) {
  const router = useRouter();
  const paid = plans.filter((p) => p.pricePaise > 0);

  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // Bumped after a create so the form remounts fresh with a new generated code.
  const [formKey, setFormKey] = useState(0);
  const [pending, startTransition] = useTransition();

  function create(values: FormValues) {
    setError(null);
    setCreated(null);
    startTransition(async () => {
      const result = await createPromo(toInput(values));
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setCreated(result.value.code);
      setFormKey((k) => k + 1);
      router.refresh();
    });
  }

  function save(id: string, values: FormValues) {
    setError(null);
    startTransition(async () => {
      const result = await editPromo({ id, ...toInput(values) });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setEditing(null);
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
            A % or ₹ discount at checkout, or a free trial: N days of one plan, no card, for members on Free —
            one trial per member, ever. Each member can use a code once. While a code is live and on the
            banner, it scrolls across the top of the home page and every analysis page.
          </p>
        </div>

        <PromoForm key={formKey} paid={paid} initial={blank(paid)} submitLabel="Create code" onSubmit={create} pending={pending} />

        {created ? (
          <p className="mt-3 text-sm font-semibold">
            {created} is created. Share it, or link people to /pricing?promo={created}.
          </p>
        ) : null}
      </section>

      {error ? <ErrorRegion title="That didn't go through">{error}</ErrorRegion> : null}

      <section>
        <h3 className="mb-3">Codes</h3>
        {promos.length === 0 ? (
          <p className="text-[0.9rem] text-[var(--color-text-muted)]">No codes yet.</p>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)]">
            {promos.map((promo) => (
              <div key={promo.id} className="border-b border-[var(--color-line)] px-4 py-3.5 last:border-b-0">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1 basis-60">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-[0.95rem] font-bold">{promo.code}</code>
                      <Tag tone={STATE_TONE[promo.state]}>{promo.state.replace("-", " ")}</Tag>
                      {promo.kind === "trial" ? <Tag tone="accent">Free trial</Tag> : null}
                      {promo.showBanner && promo.state === "live" ? <Tag tone="pink">On banner</Tag> : null}
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      {promo.label} · {promo.discount} · {promo.plans.join(", ")}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-muted)]">
                      {promo.startsAt}
                      {promo.endsAt ? ` → ${promo.endsAt}` : " → no end"} · {promo.captured}
                      {promo.maxRedemptions ? ` of ${promo.maxRedemptions}` : ""}{" "}
                      {promo.kind === "trial" ? "trials started" : "used"}
                      {promo.pending > 0 ? ` · ${promo.pending} checkout${promo.pending === 1 ? "" : "s"} opened` : ""}
                      {promo.kind === "trial" ? "" : ` · ${formatPrice(promo.revenuePaise)} taken`}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => setEditing(editing === promo.id ? null : promo.id)}
                    >
                      {editing === promo.id ? "Close" : "Edit"}
                    </Button>
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
                {editing === promo.id ? (
                  <div className="mt-4 rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)] p-4">
                    <PromoForm
                      paid={paid}
                      initial={fromPromo(promo)}
                      locked={promo.captured + promo.pending > 0}
                      submitLabel="Save changes"
                      onSubmit={(values) => save(promo.id, values)}
                      onCancel={() => setEditing(null)}
                      pending={pending}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

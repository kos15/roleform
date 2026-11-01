"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewPromo, redeemTrial } from "@/app/actions/checkout";
import { Button } from "@/components/ui";
import { CheckoutButton } from "@/components/checkout-button";
import type { PlanId } from "@/lib/content/pricing";

/**
 * A plan card's pay button with a promo field (F32).
 *
 * The preview is a server call: the browser never computes a discount, it
 * only shows the one the server priced. Checkout prices it again from the
 * code, so a tampered preview changes nothing that is charged.
 *
 * A free-trial code (F32.1) swaps the pay button for "Start free trial": no
 * checkout, the server raises the plan for the code's days. Signed out, it
 * sends the visitor to sign up and back here with the code still applied.
 */
export function PlanCheckout({
  planId,
  planName,
  listPrice,
  label,
  variant,
  initialCode,
}: {
  planId: PlanId;
  planName: string;
  listPrice: string;
  label: string;
  variant: "primary" | "secondary";
  /** From `?promo=` — the banner links here with its code filled in. */
  initialCode?: string;
}) {
  const [open, setOpen] = useState(Boolean(initialCode));
  const [code, setCode] = useState(initialCode ?? "");
  const router = useRouter();
  const [applied, setApplied] = useState<{
    code: string;
    price: string;
    discount: string;
    label: string;
    trialDays: number | null;
  } | null>(null);
  const [started, setStarted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const autoTried = useRef(false);

  /** `quiet`: a code from the URL that doesn't fit this plan says nothing — it may fit the next card. */
  function apply(value: string, quiet = false) {
    setError(null);
    startTransition(async () => {
      const result = await previewPromo(planId, value);
      if (!result.ok) {
        setApplied(null);
        if (quiet) setOpen(false);
        else setError(result.error.message);
        return;
      }
      setApplied({
        code: result.value.code,
        price: result.value.price,
        discount: result.value.discount,
        label: result.value.label,
        trialDays: result.value.trialDays,
      });
    });
  }

  function startTrial(value: string) {
    setError(null);
    startTransition(async () => {
      const result = await redeemTrial(value);
      if (!result.ok) {
        if (result.error.code === "unauthenticated") {
          router.push(`/sign-up?redirect_url=${encodeURIComponent(`/pricing?promo=${value}`)}`);
          return;
        }
        setError(result.error.message);
        return;
      }
      setStarted(`${result.value.planName} is yours until ${result.value.endsOn}.`);
      router.refresh();
    });
  }

  // Apply a code that arrived in the URL, once.
  useEffect(() => {
    if (!initialCode || autoTried.current) return;
    autoTried.current = true;
    apply(initialCode, true);
    // Once per mount; `apply` is stable in behaviour if not in identity.
  }, [initialCode]);

  return (
    <div className="flex flex-col gap-2.5">
      {applied ? (
        <div className="rounded-[var(--radius-sm)] bg-[var(--color-bg-raised)] px-3.5 py-2.5 text-sm">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-extrabold">{applied.price}</span>
            {applied.trialDays === null ? <s className="text-[var(--color-text-muted)]">{listPrice}</s> : null}
            <span className="text-xs font-semibold">
              {applied.label} · {applied.discount}
            </span>
          </div>
          <button
            type="button"
            className="mt-1 text-xs underline"
            onClick={() => {
              setApplied(null);
              setCode("");
            }}
          >
            Remove code
          </button>
        </div>
      ) : open ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply(code);
          }}
        >
          <input
            className="input min-w-0 flex-1 uppercase"
            placeholder="Promo code"
            aria-label={`Promo code for ${planName}`}
            value={code}
            maxLength={24}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary btn-sm flex-none" disabled={pending || !code.trim()}>
            {pending ? "Checking…" : "Apply"}
          </button>
        </form>
      ) : (
        <button type="button" className="self-start text-sm font-semibold underline" onClick={() => setOpen(true)}>
          Have a promo code?
        </button>
      )}
      {error ? (
        <p role="alert" className="text-xs font-semibold">
          {error}
        </p>
      ) : null}

      {applied?.trialDays ? (
        started ? (
          <p role="status" className="rounded-[var(--radius-sm)] bg-[var(--color-bg-raised)] px-3.5 py-2.5 text-sm font-semibold">
            {started} No card taken — when it ends you drop back to Free unless you choose to buy.
          </p>
        ) : (
          <>
            <Button
              variant={variant}
              className="min-h-[50px] w-full"
              busy={pending}
              disabled={pending}
              onClick={() => startTrial(applied.code)}
            >
              Start {applied.trialDays}-day free trial
            </Button>
            <p className="text-xs text-[var(--color-text-muted)]">
              No card needed. Afterwards {planName} is {listPrice} a month if you want to keep it.
            </p>
          </>
        )
      ) : (
      <CheckoutButton
        purchase={{ kind: "plan", id: planId }}
        promoCode={applied?.code}
        label={applied ? `${label} · ${applied.price}` : label}
        description={`Roleform — ${planName}, one month${applied ? ` (${applied.code})` : ""}`}
        variant={variant}
        className="min-h-[50px] w-full"
      />
      )}
    </div>
  );
}

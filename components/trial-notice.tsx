"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { CheckoutButton } from "@/components/checkout-button";
import type { PlanId } from "@/lib/domain/types";

/**
 * The note after a free trial (F32.1): while it runs, how long is left; once
 * it has lapsed, the plan at its ordinary price. Never a countdown to fear and
 * never automatic — nothing is charged unless the member clicks and pays.
 *
 * Dismissal is per browser, keyed on the state, so dismissing "2 days left"
 * still lets "your trial ended" show once later.
 */
export function TrialNotice({
  kind,
  planId,
  planName,
  price,
  daysLeft,
}: {
  kind: "on-trial" | "ended";
  planId: PlanId;
  planName: string;
  price: string;
  daysLeft?: number;
}) {
  const key = `roleform-trial:${kind}:${planId}:${kind === "on-trial" ? daysLeft : ""}`;
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(localStorage.getItem(key) === null);
    } catch {
      setShow(true);
    }
  }, [key]);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(key, "1");
    } catch {
      // Private mode. Reappears next navigation.
    }
  }

  if (!show) return null;

  const left =
    daysLeft === undefined || daysLeft <= 0
      ? "ends today"
      : `has ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;

  return (
    <div
      role="status"
      className="rise-in mx-auto mb-0 mt-4 flex w-full max-w-6xl flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border px-5 py-3.5"
      style={{ borderColor: "var(--color-sage-300)", background: "var(--color-sage-100)" }}
    >
      <p className="min-w-0 flex-[1_1_250px] text-sm leading-relaxed text-[var(--color-sage-800)]">
        {kind === "on-trial" ? (
          <>
            <strong className="font-semibold">Your free {planName} trial {left}.</strong> Liking it? Keep{" "}
            {planName} for {price} a month — buying now adds 30 days on top of the trial, so you lose
            nothing by deciding early.
          </>
        ) : (
          <>
            <strong className="font-semibold">Your free {planName} trial has ended.</strong> You&rsquo;re
            back on Free, and everything you made is still here. Pick up where you left off with{" "}
            {planName} for {price} a month — nothing renews itself.
          </>
        )}
      </p>

      <CheckoutButton
        purchase={{ kind: "plan", id: planId }}
        label={`Keep ${planName} · ${price}`}
        description={`Roleform — ${planName}, one month`}
        variant="secondary"
      />
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="grid h-8 w-8 flex-none place-items-center rounded-[var(--radius-pill)] text-[var(--color-sage-800)] transition-colors hover:bg-[var(--color-sage-200)]"
      >
        <X className="lucide h-4 w-4" />
      </button>
    </div>
  );
}

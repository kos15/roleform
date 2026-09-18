"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { CheckoutButton } from "@/components/checkout-button";
import type { PlanId } from "@/lib/domain/types";

/**
 * The one-time renewal warning (F23).
 *
 * Same mechanism as `LowBalanceNotice`: dismissal is keyed on the expiry
 * date itself, so a renewal (which moves the date) makes next cycle's
 * warning a different warning and it shows again. Client-side because it is
 * a per-browser courtesy, not account state.
 */
export function RenewalNotice({
  planId,
  planName,
  expiresOn,
  daysLeft,
}: {
  planId: PlanId;
  planName: string;
  expiresOn: string;
  daysLeft: number;
}) {
  const key = `roleform-renewal:${expiresOn}`;
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
      // Private mode. Reappears next navigation — annoying beats silent.
    }
  }

  if (!show) return null;

  return (
    <div
      role="status"
      className="rise-in mx-auto mb-0 mt-4 flex w-full max-w-6xl flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border px-5 py-3.5"
      style={{ borderColor: "var(--color-sage-300)", background: "var(--color-sage-100)" }}
    >
      <p className="min-w-0 flex-[1_1_250px] text-sm leading-relaxed text-[var(--color-sage-800)]">
        <strong className="font-semibold">
          {daysLeft === 0 ? `${planName} ends today.` : `${planName} ends ${expiresOn}.`}
        </strong>{" "}
        Nothing renews itself — buy another 30 days whenever you want them, and it stacks on
        what&rsquo;s left rather than resetting the clock.
      </p>

      <CheckoutButton
        purchase={{ kind: "plan", id: planId }}
        label={`Renew ${planName}`}
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

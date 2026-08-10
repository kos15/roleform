"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorRegion } from "@/components/ui";
import { startPlanCheckout, startTopupCheckout } from "@/app/actions/checkout";
import type { PlanId } from "@/lib/content/pricing";

/**
 * The pay button (F17, F19).
 *
 * The provider's widget is loaded on FIRST CLICK, not on page load. A pricing
 * page that pulls in a third-party payment script to be read is a page that
 * hands a tracker to everyone who was only comparing numbers — and the script
 * is useless until someone actually intends to pay.
 *
 * The order is created server-side (app/actions/checkout.ts) and the plan or
 * the tokens are granted server-side (the webhook). This component can do
 * neither, which is the point: everything it touches is already public.
 */
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadWidget(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);

  return new Promise((resolve) => {
    const tag = document.createElement("script");
    tag.src = SCRIPT;
    tag.onload = () => resolve(Boolean(window.Razorpay));
    tag.onerror = () => resolve(false);
    document.body.appendChild(tag);
  });
}

export type Purchase =
  | { kind: "plan"; id: PlanId | string }
  | { kind: "topup"; id: string };

export function CheckoutButton({
  purchase,
  label,
  description,
  variant = "primary",
  className,
  onPurchased,
}: {
  purchase: Purchase;
  label: string;
  /** Shown inside the provider's window. Never carries a subject or address. */
  description: string;
  variant?: "primary" | "secondary";
  className?: string;
  /**
   * The provider's window closed on a successful payment. NOT a confirmation
   * that anything was granted — the webhook does that, and the caller's copy
   * must say so. Omitted on /pricing, where the redirect is the feedback.
   */
  onPurchased?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);

    const order =
      purchase.kind === "plan"
        ? await startPlanCheckout(purchase.id as PlanId)
        : await startTopupCheckout(purchase.id);

    if (!order.ok) {
      // Signed out is the ordinary case on a public page, not a failure worth
      // an error region — send them to sign in and bring them back here.
      if (order.error.code === "unauthenticated") {
        router.push("/sign-in?redirect_url=/pricing");
        return;
      }
      setError(order.error.message);
      setBusy(false);
      return;
    }

    if (!(await loadWidget())) {
      setError("The payment window didn't load. A blocker or a flaky connection will do that.");
      setBusy(false);
      return;
    }

    new window.Razorpay!({
      key: order.value.keyId,
      order_id: order.value.id,
      amount: order.value.amount,
      currency: order.value.currency,
      name: "Roleform",
      description,
      // Payment is confirmed by the webhook, never here. This handler only
      // refreshes so the new caps are visible; a client that granted the plan
      // would grant it to anyone who could call it.
      handler: () => {
        setBusy(false);
        router.refresh();
        if (onPurchased) onPurchased();
        else router.push("/profile");
      },
      modal: { ondismiss: () => setBusy(false) },
    }).open();
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={pay}
        disabled={busy}
        busy={busy}
        variant={variant}
        className={className}
      >
        {busy ? "Opening…" : label}
      </Button>
      {error ? <ErrorRegion title="That didn't open">{error}</ErrorRegion> : null}
    </div>
  );
}

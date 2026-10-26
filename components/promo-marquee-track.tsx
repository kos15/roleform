"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import type { PromoBanner } from "@/lib/services/promo/server";

/**
 * The moving half of the promo strip (F32).
 *
 * The track is the offer repeated twice and slid by half its width, so the
 * loop has no seam. Hover or focus pauses it; under prefers-reduced-motion it
 * does not move at all and reads as a static line (globals.css). Dismissing
 * hides it for this browser session only — the offer is still on /pricing.
 */
const DISMISS_KEY = "roleform:promo-dismissed";

export function PromoMarqueeTrack({ banners, className }: { banners: PromoBanner[]; className?: string }) {
  const signature = banners.map((b) => b.code).join(",");
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === signature) setHidden(true);
    } catch {
      // Storage blocked — the strip just stays.
    }
  }, [signature]);

  if (hidden) return null;

  const first = banners[0];
  // Each half repeats the offers until it comfortably outruns a wide screen,
  // so one short line never leaves a gap mid-loop.
  const run = Array.from({ length: Math.max(2, Math.ceil(4 / banners.length)) }).flatMap(() => banners);

  return (
    <div className={`promo-marquee ${className ?? ""}`} role="region" aria-label="Current offer">
      <Link
        href={`/pricing?promo=${encodeURIComponent(first.code)}`}
        className="promo-marquee__viewport no-underline"
        aria-label={`${first.text}${first.endsOn ? `, until ${first.endsOn}` : ""}. See plans.`}
      >
        <span className="promo-marquee__track" aria-hidden>
          {[0, 1].map((copy) => (
            <span key={copy} className="promo-marquee__half">
              {run.map((b, i) => (
                <span key={`${copy}-${i}`} className="promo-marquee__item">
                  <Sparkles className="lucide promo-marquee__spark h-4 w-4" />
                  <span>{b.text}</span>
                  <span className="promo-marquee__code">{b.code}</span>
                  {b.endsOn ? <span className="promo-marquee__ends">until {b.endsOn}</span> : null}
                </span>
              ))}
            </span>
          ))}
        </span>
      </Link>
      <button
        type="button"
        className="promo-marquee__close"
        aria-label="Hide this offer"
        onClick={() => {
          setHidden(true);
          try {
            sessionStorage.setItem(DISMISS_KEY, signature);
          } catch {
            // Fine — it's hidden for this page view.
          }
        }}
      >
        <X className="lucide h-4 w-4" />
      </button>
    </div>
  );
}

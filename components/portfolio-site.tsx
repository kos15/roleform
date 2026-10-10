"use client";

import { useEffect, useMemo, useRef } from "react";
import { renderDc } from "@/lib/render/portfolio/dc";
import { SITE_TEMPLATE } from "@/lib/render/portfolio/template";
import { RF_MOTION } from "@/lib/render/portfolio/motion";
import { siteVals, type SiteData, type SiteProps } from "@/lib/domain/portfolio-site";

/**
 * F28 — one portfolio look, rendered from the member's own profile with the
 * design's template. Every interpolated value is escaped by the renderer; the
 * markup is ours. With `onPick`, empty photo slots (dashed, `hints`) open the
 * file picker for that slot.
 */
export function PortfolioSite({
  data,
  onPick,
  motion = true,
  ...props
}: SiteProps & { data: SiteData; onPick?: (slot: string) => void; motion?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  const html = useMemo(
    () => renderDc(SITE_TEMPLATE, siteVals(data, props), Boolean(onPick)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, props.theme, props.vw, props.hints, props.focus, props.showEmail, props.showPhone, props.showLinks, props.photos, Boolean(onPick)],
  );

  useEffect(() => {
    const root = ref.current?.querySelector<HTMLElement>("[data-pf-root]");
    if (!root || !motion) return;
    const m = RF_MOTION(root);
    return () => m?.destroy();
  }, [html, motion]);

  return (
    <div
      ref={ref}
      onClick={(e) => {
        const slot = (e.target as HTMLElement).closest<HTMLElement>("[data-pick]")?.dataset.pick;
        if (slot && pickRef.current) {
          e.preventDefault();
          e.stopPropagation();
          pickRef.current(slot);
          return;
        }
        // A preview, not the page: its links (mailto, profiles, #anchors) stay put.
        if ((e.target as HTMLElement).closest("a")) e.preventDefault();
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

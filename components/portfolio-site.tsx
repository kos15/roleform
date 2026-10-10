"use client";

import { useEffect, useMemo, useRef } from "react";
import { renderDc } from "@/lib/render/portfolio/dc";
import { SITE_TEMPLATE } from "@/lib/render/portfolio/template";
import { RF_MOTION } from "@/lib/render/portfolio/motion";
import { siteVals, type SiteData, type SiteProps } from "@/lib/domain/portfolio-site";

/**
 * F28 — one portfolio look, rendered from the member's own profile with the
 * design's template. Every interpolated value is escaped by the renderer; the
 * markup is ours.
 *
 * It lives in a shadow root: the look is the member's page, not a Roleform
 * surface (CLAUDE.md §9 exempts export templates from `marigold`), so none of
 * the app's type, link or button styles may reach it. Fonts are document-level
 * (@font-face is global), loaded by the studio.
 *
 * With `onPick`, empty photo slots (dashed, `hints`) open the file picker.
 */

/** The page's own base styles — the design's export stylesheet, minus what only a full page needs. */
const SHADOW_CSS = [
  ":host{all:initial;display:block}",
  "*,*::before,*::after{box-sizing:border-box}",
  "img{display:block;max-width:100%}",
  "a{transition:opacity .2s ease}",
  "a:hover{opacity:.72}",
  ":focus-visible{outline:2px solid currentColor;outline-offset:3px}",
  "@media (prefers-reduced-motion:reduce){*{transition:none!important}}",
].join("\n");

export function PortfolioSite({
  data,
  onPick,
  motion = true,
  ...props
}: SiteProps & { data: SiteData; onPick?: (slot: string) => void; motion?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  const html = useMemo(
    () => renderDc(SITE_TEMPLATE, siteVals(data, props), Boolean(onPick)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, props.theme, props.vw, props.hints, props.focus, props.showEmail, props.showPhone, props.showLinks, props.photos, Boolean(onPick)],
  );

  // One shadow root per host, with its click handling.
  useEffect(() => {
    const el = host.current;
    if (!el || el.shadowRoot) return;
    const root = el.attachShadow({ mode: "open" });
    root.addEventListener("click", (e) => {
      const path = e.composedPath() as HTMLElement[];
      const slot = path.find((n) => n instanceof HTMLElement && n.dataset.pick)?.dataset.pick;
      if (slot && pickRef.current) {
        e.preventDefault();
        e.stopPropagation();
        pickRef.current(slot);
        return;
      }
      // A preview, not the page: its links (mailto, profiles) stay put; #anchors scroll within it.
      const a = path.find((n) => n instanceof HTMLAnchorElement) as HTMLAnchorElement | undefined;
      if (!a) return;
      e.preventDefault();
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("#") && href.length > 1) {
        root.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }, []);

  useEffect(() => {
    const root = host.current?.shadowRoot;
    if (!root) return;
    root.innerHTML = `<style>${SHADOW_CSS}</style>${html}`;
    const page = root.querySelector<HTMLElement>("[data-pf-root]");
    if (!page || !motion) return;
    const m = RF_MOTION(page);
    return () => m?.destroy();
  }, [html, motion]);

  return <div ref={host} />;
}

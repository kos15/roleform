/**
 * F28 — the downloadable index.html: the chosen look, rendered from the
 * member's profile with their photos embedded as data URLs, the design's
 * export stylesheet and the motion engine inline. PURE: no DOM needed.
 *
 * Every link on it is one the profile states (siteVals builds them from the
 * excerpt); fonts are the only thing it loads.
 */

import { escapeHtml, renderDc } from "./dc";
import { SITE_FONTS_HREF, SITE_TEMPLATE } from "./template";
import { MOTION_SOURCE } from "./motion";
import { siteVals, type SiteData, type SiteProps } from "@/lib/domain/portfolio-site";

/** The page's only stylesheet (design PF_EXPORT_CSS): resets, focus, and the phone layout for the tile and spread looks. */
const EXPORT_CSS = [
  "*,*::before,*::after{box-sizing:border-box}",
  "html,body{margin:0}",
  "html{-webkit-text-size-adjust:100%;text-size-adjust:100%}",
  "html{scroll-behavior:smooth}",
  "img{display:block;max-width:100%}",
  "a{transition:opacity .2s ease}",
  "a:hover{opacity:.72}",
  ":focus-visible{outline:2px solid currentColor;outline-offset:3px}",
  "@media (max-width:720px){[data-bento]{grid-template-columns:minmax(0,1fr)!important;grid-auto-rows:auto!important}[data-bento]>*{grid-column:auto!important;grid-row:auto!important}[data-tall]{min-height:300px!important}[data-gutter]{border-right:0!important}[data-side]{display:none!important}[data-mac]{grid-template-columns:minmax(0,1fr)!important}[data-mac]>*{grid-column:auto!important;grid-row:auto!important}}",
  "@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important}}",
].join("\n");

export function exportPortfolioHtml(data: SiteData, props: Omit<SiteProps, "vw" | "hints">): string {
  const body = renderDc(SITE_TEMPLATE, siteVals(data, { ...props, vw: 1280, hints: false }), false);
  const title = [data.name, data.headline].filter(Boolean).join(" — ");
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(data.summary || title)}">`,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link rel="stylesheet" href="${escapeHtml(SITE_FONTS_HREF)}">`,
    `<style>\n${EXPORT_CSS}\n</style>`,
    "</head>",
    "<body>",
    body,
    `<script>\n${MOTION_SOURCE.replace(/<\/script/gi, "<\\/script")}\n</script>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

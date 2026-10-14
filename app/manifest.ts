import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/seo/site";
import { ICON_VERSION } from "@/lib/seo/icons";

/**
 * The installable app (F29). What Android's "Install app", desktop Chrome's
 * install button and iOS's "Add to Home Screen" all read.
 *
 * `start_url` is the signed-in home: an installed Roleform is for working, and
 * a signed-out launch is bounced to sign-in by the middleware anyway. PNG
 * icons, not the SVG alone — Android needs 192 and 512 rasters to offer the
 * install, and the maskable one is drawn inside the safe zone so a round or
 * squircle mask never clips the mark.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/analyze",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Literal colours: the manifest is read by the OS, not the stylesheet.
    background_color: "#f8f0e3",
    theme_color: "#f8f0e3",
    categories: ["productivity", "business"],
    icons: [
      { src: `/icons/icon-192.png?v=${ICON_VERSION}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/icons/icon-512.png?v=${ICON_VERSION}`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/icons/icon-maskable-192.png?v=${ICON_VERSION}`, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: `/icons/icon-maskable-512.png?v=${ICON_VERSION}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      // Android's themed icons tint this silhouette to the wallpaper.
      { src: `/icons/badge-192.png?v=${ICON_VERSION}`, sizes: "192x192", type: "image/png", purpose: "monochrome" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "New analysis", url: "/analyze", icons: [{ src: `/icons/icon-192.png?v=${ICON_VERSION}`, sizes: "192x192" }] },
      { name: "History", url: "/history", icons: [{ src: `/icons/icon-192.png?v=${ICON_VERSION}`, sizes: "192x192" }] },
      { name: "Jobs", url: "/jobs", icons: [{ src: `/icons/icon-192.png?v=${ICON_VERSION}`, sizes: "192x192" }] },
    ],
  };
}

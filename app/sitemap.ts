import type { MetadataRoute } from "next";
import { GUIDES } from "@/lib/content/guides";
import { PUBLIC_PAGES, absoluteUrl } from "@/lib/seo/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    ...PUBLIC_PAGES.map((p) => ({
      url: absoluteUrl(p.path),
      lastModified: now,
      changeFrequency: (p.path === "/status" ? "hourly" : "weekly") as "hourly" | "weekly",
      priority: p.priority,
    })),
    ...GUIDES.map((g) => ({
      url: absoluteUrl(`/guides/${g.slug}`),
      lastModified: new Date(g.updated),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}

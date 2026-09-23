import type { MetadataRoute } from "next";
import { SITE_URL, absoluteUrl } from "@/lib/seo/site";

/**
 * Public pages are open to every crawler, including the AI search and
 * assistant crawlers by name — an engine that is blocked cannot cite us. The
 * signed-in app is closed to all of them. /admin is deliberately NOT listed:
 * robots.txt is public, and naming it would advertise that it exists (it 404s
 * for everyone but admins and sends noindex). The rest of the app is closed: those pages are a person's résumé
 * and analyses (N7), and they redirect to sign-in anyway.
 */
const PRIVATE = [
  "/analyze",
  "/analysis/",
  "/profile",
  "/history",
  "/jobs",
  "/onboarding",
  "/api/",
  "/md/",
];

const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
  "DuckAssistBot",
  "meta-externalagent",
  "Amazonbot",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_CRAWLERS, allow: ["/", "/llms.txt", "/llms-full.txt"], disallow: PRIVATE },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_URL,
  };
}

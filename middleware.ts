import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Everything under (app) requires a session. The marketing route, the auth
 * pages and the Clerk webhook stay public.
 *
 * So do the written pages. Privacy and terms in particular are promises about
 * what we do with a résumé — a promise you must create an account to read is
 * not one you can act on. Status is public for the same reason: the people most
 * likely to need it are the ones who can't get in. Pricing joins them: a price
 * you have to sign up to read is not a price you can compare. /appearance is
 * public only so its redirect (next.config.ts) reaches the visitor rather
 * than bouncing through sign-in first.
 *
 * Both webhooks are public because they are called by a machine that has no
 * session. Each verifies its own signature — that is what stands in for the
 * session, and it is checked before either handler touches its body.
 */
const isPublic = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/clerk",
  "/api/webhooks/razorpay",
  "/how-it-works",
  "/privacy",
  "/terms",
  "/contact",
  "/support",
  "/pricing",
  "/status",
  "/appearance",
  // Search and agent surfaces (lib/seo): the guides, the template shelf, the
  // machine-readable files and every page's Markdown mirror.
  "/guides(.*)",
  "/templates",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/llms.txt",
  "/llms-full.txt",
  "/indexnow.txt",
  "/opengraph-image(.*)",
  "/icon.svg",
  "/md(.*)",
  "/(.*).md",
]);

/**
 * Public pages that have a Markdown mirror (lib/seo/markdown.ts). Kept as a
 * pattern here rather than imported, because middleware runs on the edge and
 * should not pull the content modules into its bundle.
 */
const MIRRORED = /^\/(?:|pricing|templates|guides(?:\/[a-z0-9-]+)?|how-it-works|privacy|terms|support|contact)$/;

/**
 * Agents get Markdown two ways without guessing URLs: `/<path>.md`, or the
 * canonical URL with `Accept: text/markdown`. Both rewrite to the /md route.
 * Returns null when the request is an ordinary page view.
 */
function markdownRewrite(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  let target: string | null = null;

  if (pathname.endsWith(".md")) {
    const page = pathname === "/index.md" ? "/" : pathname.slice(0, -3);
    if (MIRRORED.test(page)) target = page;
  } else if (
    MIRRORED.test(pathname) &&
    (request.headers.get("accept") ?? "").includes("text/markdown")
  ) {
    target = pathname;
  }

  if (target === null) return null;
  const url = request.nextUrl.clone();
  url.pathname = target === "/" ? "/md" : `/md${target}`;
  const response = NextResponse.rewrite(url);
  response.headers.set("Vary", "Accept");
  return response;
}

export default clerkMiddleware(async (auth, request) => {
  const markdown = markdownRewrite(request);
  if (markdown) return markdown;

  if (!isPublic(request)) {
    await auth.protect();
    return;
  }

  // Advertise the Markdown alternate on every mirrored HTML page, so an agent
  // that lands on the HTML learns where the compact version is.
  const { pathname } = request.nextUrl;
  if (MIRRORED.test(pathname)) {
    const response = NextResponse.next();
    const md = pathname === "/" ? "/index.md" : `${pathname}.md`;
    response.headers.set("Link", `<${md}>; rel="alternate"; type="text/markdown"`);
    response.headers.set("Vary", "Accept");
    return response;
  }
});

export const config = {
  matcher: [
    // Skip Next internals and static files unless they appear in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

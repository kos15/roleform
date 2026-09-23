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
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublic(request)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next internals and static files unless they appear in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Everything under (app) requires a session. The marketing route, the auth
 * pages and the Clerk webhook stay public.
 *
 * So do the written pages. Privacy and terms in particular are promises about
 * what we do with a résumé — a promise you must create an account to read is
 * not one you can act on. Status is public for the same reason: the people most
 * likely to need it are the ones who can't get in.
 */
const isPublic = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/clerk",
  "/how-it-works",
  "/privacy",
  "/terms",
  "/changelog",
  "/contact",
  "/support",
  "/status",
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

import Link from "next/link";
import { Suspense } from "react";
// Clerk v7 replaced <SignedIn>/<SignedOut> with <Show when="signed-in" | "signed-out">.
import { Show, SignInButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Brand } from "@/components/brand";
import { SiteFooter } from "@/components/site-footer";
import { NavLinks } from "@/components/nav-links";
import { MobileTabBar } from "@/components/mobile-tabbar";
import { SheetAccount } from "@/components/sheet-account";
import { Button } from "@/components/ui";
import { currentRole } from "@/lib/admin/role";

/**
 * Chrome for the public surfaces: the landing page and everything a person
 * should be able to read before signing in — how it works, privacy, terms,
 * contact, support and status.
 *
 * Privacy and terms in particular are behind no session on purpose. A promise
 * you have to create an account to read is not a promise you can rely on.
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // The bottom bar is navigation for a session, so it appears here only once
  // there is one. A signed-out visitor keeps the wrapping header links instead
  // — four of them fit, and a tab bar offering Profile and Tokens to someone
  // with neither would be chrome writing cheques the account can't cash.
  const { userId } = await auth();
  const signedIn = Boolean(userId);
  const isAdmin = userId ? (await currentRole(userId)) === "admin" : false;

  return (
    <div className="flex min-h-screen flex-col">
      {/* intro-item: the first thing to rise after the landing intro (globals.css). */}
      <header className="nav intro-item">
        {/* Signed in, the mark goes back to the work rather than to the pitch:
            landing on the marketing page from inside a session — with its
            "Get started" and its explanation of what Roleform is — reads as
            having been logged out. */}
        <Link
          href={signedIn ? "/analyze" : "/"}
          className="mr-auto flex items-center no-underline"
        >
          <Brand />
        </Link>

        <NavLinks
          className={signedIn ? "wide-only" : undefined}
          links={[
            { href: "/how-it-works", label: "How it works" },
            { href: "/templates", label: "Templates" },
            { href: "/guides", label: "Guides" },
            { href: "/pricing", label: "Pricing" },
            { href: "/status", label: "Status" },
          ]}
        />

        <div className="ml-auto flex flex-none items-center gap-2">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button variant="ghost" className="wide-only">
                Sign in
              </Button>
            </SignInButton>
          </Show>
          <Link href="/analyze" className="btn btn-primary no-underline">
            Open Roleform
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1320px] flex-1 px-[clamp(1.1rem,6vw,6rem)] pb-[clamp(3rem,7vw,6.5rem)] pt-[clamp(1.75rem,5vw,4.5rem)]">
        {children}
      </main>

      <SiteFooter />

      {signedIn ? (
        <MobileTabBar
          extraLinks={
          isAdmin ? [{ href: "/admin", label: "Admin", hint: "Members, caps and the support inbox" }] : []
        }
          account={
            <Suspense fallback={null}>
              <SheetAccount />
            </Suspense>
          }
        />
      ) : null}
    </div>
  );
}

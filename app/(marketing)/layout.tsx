import Link from "next/link";
import { Suspense } from "react";
// Clerk v7 replaced <SignedIn>/<SignedOut> with <Show when="signed-in" | "signed-out">.
import { Show, SignInButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Brand } from "@/components/brand";
import { AppearanceLink } from "@/components/appearance-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { SiteFooter } from "@/components/site-footer";
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
      <header className="nav">
        {/* Signed in, the mark goes back to the work rather than to the pitch.
            The mobile bar sends members here for Tokens and Appearance, and
            landing on the marketing page from inside a session — with its
            "Get started" and its explanation of what Roleform is — reads as
            having been logged out. */}
        <Link
          href={signedIn ? "/analyze" : "/"}
          className="mr-auto flex items-center gap-2.5 no-underline"
        >
          <Brand />
        </Link>

        <nav
          aria-label="Main"
          className={`nav-links text-sm${signedIn ? " wide-only" : ""}`}
        >
          <Link href="/how-it-works" className="text-[var(--color-text-muted)]">
            How it works
          </Link>
          <Link href="/pricing" className="text-[var(--color-text-muted)]">
            Pricing
          </Link>
          <Link href="/status" className="text-[var(--color-text-muted)]">
            Status
          </Link>
        </nav>

        <span className={signedIn ? "wide-only contents" : "contents"}>
          <AppearanceLink />
        </span>
        <ThemeToggle />

        <Show when="signed-out">
          <SignInButton mode="modal">
            <Button variant="secondary" size="sm">
              Sign in
            </Button>
          </SignInButton>
        </Show>
        <Show when="signed-in">
          <Link href="/analyze" className="no-underline">
            <Button size="sm">Open Roleform</Button>
          </Link>
        </Show>
      </header>

      <main className="w-full flex-1">{children}</main>

      <SiteFooter />

      {signedIn ? (
        <MobileTabBar
          isAdmin={isAdmin}
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

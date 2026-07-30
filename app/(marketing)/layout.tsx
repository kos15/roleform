import Link from "next/link";
// Clerk v7 replaced <SignedIn>/<SignedOut> with <Show when="signed-in" | "signed-out">.
import { Show, SignInButton } from "@clerk/nextjs";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui";

/**
 * Chrome for the public surfaces: the landing page and everything a person
 * should be able to read before signing in — how it works, privacy, terms,
 * changelog, contact, support and status.
 *
 * Privacy and terms in particular are behind no session on purpose. A promise
 * you have to create an account to read is not a promise you can rely on.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="nav">
        <Link href="/" className="mr-auto flex items-center gap-2.5 no-underline">
          <Brand />
        </Link>

        <nav aria-label="Main" className="hidden flex-wrap items-center gap-4 text-sm sm:flex">
          <Link href="/how-it-works" className="text-[var(--color-text-muted)]">
            How it works
          </Link>
          <Link href="/changelog" className="text-[var(--color-text-muted)]">
            Changelog
          </Link>
          <Link href="/status" className="text-[var(--color-text-muted)]">
            Status
          </Link>
        </nav>

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
    </div>
  );
}

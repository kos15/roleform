import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { Brand } from "@/components/brand";
import { AppearanceLink } from "@/components/appearance-link";
import { TokenPill } from "@/components/token-pill";
import { LowBalanceBanner } from "@/components/low-balance-banner";
import { ThemeToggle } from "@/components/theme-toggle";
import { SiteFooter } from "@/components/site-footer";
import { MobileTabBar } from "@/components/mobile-tabbar";
import { SheetAccount } from "@/components/sheet-account";
import { ProductTour, TourLauncher } from "@/components/product-tour";
import { currentRole } from "@/lib/admin/role";

/**
 * The chip says which role you are holding, because two of the nav links behave
 * differently depending on it and a 403 you could have predicted is a worse
 * 403. Reads Clerk (memoised per request) and refreshes the mirror on the way
 * past, so a role granted in the dashboard takes effect on the next page view
 * rather than after a deploy.
 */
async function RoleChip() {
  const { userId } = await auth();
  if (!userId) return null;

  const role = await currentRole(userId);
  return (
    <span className="wide-only hidden text-xs text-[var(--color-text-muted)] sm:inline">
      {role === "admin" ? "Admin" : "Member"}
    </span>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Only decides whether the sheet lists Admin. /admin enforces it on its own —
  // this is the difference between a door that 403s and no door.
  const { userId } = await auth();
  const isAdmin = userId ? (await currentRole(userId)) === "admin" : false;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="nav">
        <Link href="/analyze" className="mr-auto flex items-center gap-2.5 no-underline">
          <Brand />
        </Link>

        {/* Below 860px these five move to the bottom bar and the sheet, which
            is where a thumb is. See `.tabbar` in globals.css. */}
        <nav aria-label="Main" className="nav-links wide-only text-sm">
          {/* "New analysis" rather than "Analyze": from anywhere inside a finished
              analysis this link discards it and starts another, and the verb
              alone didn't say so. */}
          <Link href="/analyze">New analysis</Link>
          <Link href="/history" className="text-[var(--color-text-muted)]">
            History
          </Link>
          <Link href="/profile" className="text-[var(--color-text-muted)]">
            Profile
          </Link>
          {/* In the design's nav, and everywhere else in the product — the
              footer, the sheet, the meter's own tooltip. It was the one width
              where the way to buy more tokens wasn't one click from the meter
              that tells you they're running out. */}
          <Link href="/pricing" className="text-[var(--color-text-muted)]">
            Pricing
          </Link>
          {/* Shown to everyone on purpose. A member who clicks it gets a 403 that
              names the permission and the people who can grant it — which is more
              use than a link that quietly isn't there. */}
          <Link href="/admin" className="text-[var(--color-text-muted)]">
            Admin
          </Link>
          <Link href="/status" className="text-[var(--color-text-muted)]">
            Status
          </Link>
        </nav>

        {/* Two aggregate queries. Suspended for the same reason as the role
            chip below: awaiting it in the layout would hold the first paint of
            every signed-in page behind the token meter. */}
        <Suspense fallback={null}>
          <TokenPill />
        </Suspense>

        {/* Both of these drop below 860px: the walkthrough spotlights header
            controls that have moved to the bottom bar by then, and the palette
            gets a spelled-out row in the sheet instead of a second circle. */}
        <span className="wide-only contents">
          <TourLauncher />
          <AppearanceLink />
        </span>
        <ThemeToggle />

        {/* UserButton stays at every width on purpose, unlike the role chip:
            it is the only way out of the session. */}
        <div className="flex flex-none items-center gap-2">
          {/* Suspended for the same reason as the footer's status dot: this
              chip costs a Clerk read, and a layout that awaits resolves before
              any child renders — so awaiting it here held the FIRST PAINT of
              every signed-in page behind a directory round trip, and no child
              loading.tsx could get in front of it. */}
          <Suspense fallback={null}>
            <RoleChip />
          </Suspense>
          <UserButton />
        </div>
      </header>

      {/* Under the header rather than inside a page: it is about the account,
          not about whatever surface you happen to be on, and it says its piece
          once per cycle (F19). */}
      <div className="px-6">
        <Suspense fallback={null}>
          <LowBalanceBanner />
        </Suspense>
      </div>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>

      <SiteFooter />

      {/* Outside <main> on purpose: it measures controls in the header and the
          page alike, so it can't live inside either. */}
      <ProductTour />

      <MobileTabBar
        isAdmin={isAdmin}
        account={
          <Suspense fallback={null}>
            <SheetAccount />
          </Suspense>
        }
      />
    </div>
  );
}

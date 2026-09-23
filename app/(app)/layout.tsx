import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { Brand } from "@/components/brand";
import { TokenPill } from "@/components/token-pill";
import { LowBalanceBanner } from "@/components/low-balance-banner";
import { RenewalBanner } from "@/components/renewal-banner";
import { SiteFooter } from "@/components/site-footer";
import { NavLinks } from "@/components/nav-links";
import { MobileTabBar } from "@/components/mobile-tabbar";
import { SheetAccount } from "@/components/sheet-account";
import { ProductTour, TourLauncher } from "@/components/product-tour";
import { currentRole } from "@/lib/admin/role";

/** Signed-in and auth surfaces are a person's own data, not search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Decides whether the header and the sheet list Admin at all. For anyone else
  // the admin section is invisible: /admin 404s (lib/admin/guard.ts).
  const { userId } = await auth();
  const isAdmin = userId ? (await currentRole(userId)) === "admin" : false;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="nav">
        <Link href="/analyze" className="mr-auto flex items-center no-underline">
          <Brand />
        </Link>

        {/* Below 860px these move to the bottom bar and the sheet, which is
            where a thumb is. See `.tabbar` in globals.css.
            "New analysis" rather than "Analyze": from anywhere inside a finished
            analysis this link discards it and starts another, and the verb
            alone didn't say so. It also claims /analysis, because that is the
            same thread of work. Admin is listed only for admins; /admin still
            enforces the role on its own. */}
        <NavLinks
          className="wide-only"
          links={[
            { href: "/analyze", label: "New analysis", match: ["/analyze", "/analysis", "/onboarding"] },
            { href: "/jobs", label: "Jobs" },
            { href: "/history", label: "History" },
            { href: "/profile", label: "Profile" },
            { href: "/pricing", label: "Pricing" },
            ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
          ]}
        />

        <div className="ml-auto flex flex-none items-center gap-3.5">
          {/* Two aggregate queries. Suspended so the layout doesn't hold the
              first paint of every signed-in page behind the token meter. */}
          <Suspense fallback={null}>
            <TokenPill />
          </Suspense>

          {/* The walkthrough spotlights header controls that have moved to the
              bottom bar below 860px, so the launcher drops there too. */}
          <span className="wide-only contents">
            <TourLauncher />
          </span>

          <span aria-hidden className="wide-only h-[30px] w-px bg-[var(--color-line)]" />

          {/* UserButton stays at every width: it is the only way out of the
              session. The name beside it is hidden below 1180px by CSS. */}
          <UserButton
            showName
            appearance={{
              elements: {
                avatarBox: { width: 44, height: 44 },
                userButtonOuterIdentifier: {
                  fontWeight: 800,
                  fontSize: 16,
                  color: "var(--color-text)",
                  fontFamily: "var(--font-body)",
                },
              },
            }}
          />
        </div>
      </header>

      {/* Under the header rather than inside a page: it is about the account,
          not about whatever surface you happen to be on, and it says its piece
          once per cycle (F19). */}
      <div className="px-[clamp(1.1rem,6vw,6rem)]">
        <Suspense fallback={null}>
          <LowBalanceBanner />
        </Suspense>
        <Suspense fallback={null}>
          <RenewalBanner />
        </Suspense>
      </div>

      <main className="mx-auto w-full max-w-[1320px] flex-1 px-[clamp(1.1rem,6vw,6rem)] pb-[clamp(3rem,7vw,6.5rem)] pt-[clamp(1.75rem,5vw,4.5rem)]">
        {children}
      </main>

      <SiteFooter />

      {/* Outside <main> on purpose: it measures controls in the header and the
          page alike, so it can't live inside either. */}
      <ProductTour />

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
    </div>
  );
}

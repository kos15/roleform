import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { Brand } from "@/components/brand";
import { LowBalanceBanner } from "@/components/low-balance-banner";
import { RenewalBanner } from "@/components/renewal-banner";
import { SiteFooter } from "@/components/site-footer";
import { NavLinks } from "@/components/nav-links";
import { MobileTabBar } from "@/components/mobile-tabbar";
import { PushSync } from "@/components/push-sync";
import { SheetAccount } from "@/components/sheet-account";
import { ProductTour, TourLauncher } from "@/components/product-tour";
import { currentRole } from "@/lib/admin/role";
import { HeaderGreeting } from "@/components/header-greeting";
import { featureEnabled } from "@/lib/services/features";

/** Signed-in and auth surfaces are a person's own data, not search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Decides whether the header and the sheet list Admin at all. For anyone else
 * the admin section is invisible: /admin 404s (lib/admin/guard.ts).
 *
 * It is a Clerk directory fetch plus a mirror write, and it used to be awaited
 * at the top of this layout — so every signed-in page, and every route's
 * loading skeleton, waited on a round trip to Clerk before the first byte.
 * Now only the two places that list Admin wait for it, behind Suspense, with
 * the member's links (which is everyone's links but one) as the fallback.
 */
// `cache`: both boundaries below ask, and the answer (and its mirror write)
// should be fetched once per request, as it was when it lived up here.
const viewerIsAdmin = cache(async (): Promise<boolean> => {
  const { userId } = await auth();
  return userId ? (await currentRole(userId)) === "admin" : false;
});

function headerLinks(isAdmin: boolean, jobs = true) {
  return [
    { href: "/analyze", label: "New analysis", match: ["/analyze", "/analysis", "/onboarding"] },
    ...(jobs ? [{ href: "/jobs", label: "Jobs" }] : []),
    { href: "/history", label: "History" },
    { href: "/profile", label: "Profile" },
    { href: "/pricing", label: "Pricing" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];
}

const ADMIN_SHEET_LINK = { href: "/admin", label: "Admin", hint: "Members, caps and the support inbox" };

async function HeaderNav() {
  const [isAdmin, jobs] = await Promise.all([viewerIsAdmin(), featureEnabled("jobs")]);
  return <NavLinks className="wide-only" links={headerLinks(isAdmin, jobs)} />;
}

async function TabBar({ account }: { account: React.ReactNode }) {
  const [isAdmin, jobs] = await Promise.all([viewerIsAdmin(), featureEnabled("jobs")]);
  return <MobileTabBar extraLinks={isAdmin ? [ADMIN_SHEET_LINK] : []} account={account} jobs={jobs} />;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const account = (
    <Suspense fallback={null}>
      <SheetAccount />
    </Suspense>
  );

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
        <Suspense fallback={<NavLinks className="wide-only" links={headerLinks(false)} />}>
          <HeaderNav />
        </Suspense>

        <div className="ml-auto flex flex-none items-center gap-3.5">
          {/* The walkthrough spotlights header controls that have moved to the
              bottom bar below 860px, so the launcher drops there too. */}
          <span className="wide-only contents">
            <TourLauncher />
          </span>

          <span aria-hidden className="wide-only h-[30px] w-px bg-[var(--color-line)]" />

          {/* The first name, or a prompt to add one (F33). Ours rather than
              UserButton's showName, which printed an email address for anyone
              who signed up without a name. */}
          <Suspense fallback={null}>
            <HeaderGreeting />
          </Suspense>

          {/* UserButton stays at every width: it is the only way out of the
              session. */}
          <UserButton appearance={{ elements: { avatarBox: { width: 44, height: 44 } } }} />
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

      {/* F29: keeps this device's push subscription on file. Never prompts. */}
      <PushSync />

      {/* Outside <main> on purpose: it measures controls in the header and the
          page alike, so it can't live inside either. */}
      <ProductTour />

      <Suspense fallback={<MobileTabBar account={account} />}>
        <TabBar account={account} />
      </Suspense>
    </div>
  );
}

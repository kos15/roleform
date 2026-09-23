"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Briefcase, ChevronRight, CircleDollarSign, FilePlus2, Menu, UserRound } from "lucide-react";

/**
 * The bottom tab bar, and the sheet behind "More" (F18 chrome, ≤860px).
 *
 * On a phone the header cannot carry the product's navigation — brand, five
 * links and four controls is two rows of chrome above every page, and the two
 * things worth reaching mid-scroll end up at the top of the screen where a
 * thumb isn't. So below 860px the links come down here.
 *
 * The bar is the maroon slab from the design: marigold for where you are,
 * muted rose for everywhere else.
 *
 * **Five slots, and the fifth is a door.** Four destinations plus "More",
 * because the product has eleven surfaces and eleven is not a tab bar. The four
 * that get a slot are the ones a session actually moves between; everything
 * else — history, the documents, status, admin — is one tap deeper in the
 * sheet, which is the right depth for a thing you visit on purpose rather than
 * in passing.
 *
 * Purely additive: the bar is `display: none` above the breakpoint, so the
 * desktop header is untouched.
 */
export function MobileTabBar({
  isAdmin,
  account,
}: {
  /** Decides whether the sheet lists Admin. The route still enforces it — this
      only avoids showing a member a door that answers 403. */
  isAdmin: boolean;
  /** Rendered at the top of the sheet. A server node so the balance and the
      name stay server-read; this component never learns what's in it. */
  account?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Closing on navigation is the whole contract of the sheet: every row in it
  // is a link, and a sheet still sitting over the page it just opened is the
  // most common way this pattern gets it wrong.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);

    // The sheet scrolls; the page under it must not.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  // "New" covers the working screens, not one route: /analyze starts a run and
  // /analysis/[id] is that same run still open. Two tabs for one thread of work
  // would be a lie about where you are.
  const working = pathname.startsWith("/analyze") || pathname.startsWith("/analysis");

  const links = sheetLinks(isAdmin);

  return (
    <>
      {/* Sits at the end of the layout's flow so the footer clears the bar. */}
      <div className="tabbar-spacer" aria-hidden />

      <nav className="tabbar" aria-label="Primary">
        <Tab href="/analyze" label="New" on={working} icon={<FilePlus2 className="lucide h-5 w-5" />} />
        <Tab
          href="/jobs"
          label="Jobs"
          on={pathname.startsWith("/jobs")}
          icon={<Briefcase className="lucide h-5 w-5" />}
        />
        <Tab
          href="/profile"
          label="Profile"
          on={pathname.startsWith("/profile")}
          icon={<UserRound className="lucide h-5 w-5" />}
        />
        <Tab
          href="/pricing"
          label="Tokens"
          on={pathname.startsWith("/pricing")}
          icon={<CircleDollarSign className="lucide h-5 w-5" />}
        />
        <button
          type="button"
          className="tabbar-btn"
          data-on={open}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((v) => !v)}
        >
          <Menu className="lucide h-5 w-5" />
          <span>More</span>
        </button>
      </nav>

      {open ? (
        <div
          className="sheet-scrim"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-grip" aria-hidden />

            {account}

            <div className="flex flex-col divide-y divide-[rgb(74_13_13/0.08)]">
              {links.map((link) => (
                <Link key={link.href} href={link.href} className="sheet-row">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold">{link.label}</span>
                    <span className="block text-xs text-[var(--color-text-muted)]">
                      {link.hint}
                    </span>
                  </span>
                  <ChevronRight className="lucide h-4 w-4 flex-none text-[var(--color-text-muted)]" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Tab({
  href,
  label,
  icon,
  on,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  on: boolean;
}) {
  return (
    <Link href={href} className="tabbar-btn" aria-current={on ? "page" : undefined}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}

/**
 * Everything the tab bar didn't have room for, in the order it matters to
 * someone who opened the sheet on purpose. History leads because it is product
 * navigation the header dropped at this width; the documents trail because they
 * are read once.
 */
function sheetLinks(isAdmin: boolean): { href: string; label: string; hint: string }[] {
  return [
    { href: "/history", label: "History", hint: "Every analysis you have run" },
    { href: "/status", label: "Status", hint: "Live system health" },
    ...(isAdmin
      ? [{ href: "/admin", label: "Admin", hint: "Members, caps and coupons" }]
      : []),
    { href: "/how-it-works", label: "How it works", hint: "What we do with your words" },
    { href: "/support", label: "Support us", hint: "Independent and ad-free" },
    { href: "/contact", label: "Contact", hint: "A person answers" },
    { href: "/privacy", label: "Privacy", hint: "What we store" },
    { href: "/terms", label: "Terms", hint: "The plain-English version" },
  ];
}

import Link from "next/link";
import type { Metadata } from "next";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

/**
 * The one 404 for every unknown URL — and for any /admin URL requested by
 * someone who is not an admin, which must be indistinguishable from a page
 * that never existed (lib/admin/guard.ts). So it carries no signed-in chrome
 * and says nothing about why.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="nav">
        <Link href="/" className="mr-auto flex items-center no-underline">
          <Brand />
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col justify-center px-[clamp(1.1rem,6vw,6rem)] py-[clamp(3rem,8vw,6rem)]">
        <p className="eyebrow mb-3.5">404</p>
        <h1 className="mb-5">This page doesn&rsquo;t exist</h1>
        <p className="mb-8 max-w-[52ch] text-[17px] leading-relaxed text-[var(--color-text-muted)]">
          The link may be old, or the address mistyped. Everything Roleform offers is one step from here.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/" className="btn btn-primary no-underline">
            Go home
          </Link>
          <Link href="/guides" className="btn btn-secondary no-underline">
            Read the guides
          </Link>
        </div>
      </main>
    </div>
  );
}

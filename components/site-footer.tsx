import Link from "next/link";
import { Suspense } from "react";
import { BrandMark, Wordmark } from "@/components/brand";
import { anyDegraded, pipelineHealth } from "@/lib/status/health";

/**
 * The footer, on every surface (F13).
 *
 * Three columns because there are three kinds of link here and they are not
 * interchangeable: what you do with the product, what the product owes you in
 * writing, and how it stays paid for. The "Support us" column carries prose
 * rather than a link list — an ad-free product asking for money should say why
 * in the same breath.
 *
 * The dot beside Status is live. It appears only when a stage is actually
 * degraded, read from the same aggregate the status page renders — a decorative
 * pulse next to the word "Status" would be the exact lie that page exists to
 * prevent.
 *
 * **The footer is NOT async, and that matters more than it looks.** It sits in
 * both layouts, so while it awaited its health read, every page in the product
 * — including ones that had nothing else to wait for — held its first paint
 * behind a database round trip, and no child `loading.tsx` could help because a
 * layout resolves before its children render at all. Only the dot needs the
 * read, so only the dot is suspended: the links, the wordmark and the copyright
 * paint immediately and the dot arrives when it knows something.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--color-line)] px-[clamp(1.1rem,6vw,6rem)] pb-[clamp(1.5rem,3vw,2rem)] pt-[clamp(1.75rem,4vw,2.5rem)]">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-start justify-between gap-8">
        <div className="max-w-[34ch]">
          <div className="mb-2.5 flex items-center gap-[9px]">
            <BrandMark size={24} />
            <Wordmark size={20} />
          </div>
          <p className="text-[13px] leading-relaxed text-[var(--color-text-muted)]">
            Your own words, retargeted. We reorder and reword what you wrote — we don&rsquo;t
            invent experience you don&rsquo;t have.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap gap-10">
          <div className="flex flex-col gap-2">
            <FooterHeading>Product</FooterHeading>
            <FooterLink href="/analyze">New analysis</FooterLink>
            <FooterLink href="/jobs">Jobs</FooterLink>
            <FooterLink href="/history">History</FooterLink>
            <FooterLink href="/profile">Profile</FooterLink>
            <FooterLink href="/status">
              Status
              {/* No fallback: the absence of a dot is the healthy state, so an
                  empty slot while the read is in flight says the right thing. */}
              <Suspense fallback={null}>
                <DegradedDot />
              </Suspense>
            </FooterLink>
          </div>

          <div className="flex flex-col gap-2">
            <FooterHeading>Company</FooterHeading>
            <FooterLink href="/how-it-works">How it works</FooterLink>
            <FooterLink href="/templates">Résumé templates</FooterLink>
            <FooterLink href="/guides">Guides</FooterLink>
            <FooterLink href="/pricing">Pricing</FooterLink>
            <FooterLink href="/privacy">Privacy</FooterLink>
            <FooterLink href="/contact">Contact</FooterLink>
          </div>

          <div className="flex max-w-[26ch] flex-col gap-2.5">
            <FooterHeading>Support us</FooterHeading>
            <p className="text-[13px] leading-snug text-[var(--color-text-muted)]">
              Roleform is independent and ad-free. The vetted course catalog carries no
              affiliate links.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/support" className="btn btn-secondary btn-sm no-underline">
                Buy us a coffee
              </Link>
              <Link href="/support" className="btn btn-ghost btn-sm no-underline">
                Sponsor
              </Link>
            </div>
          </div>
        </nav>
      </div>

      <div className="mx-auto mt-6 flex max-w-[1320px] flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[var(--color-line)] pt-4">
        <span className="text-xs text-[var(--color-text-muted)]">
          Made by Kos in Pune · © {new Date().getFullYear()} Roleform
        </span>
        <div className="flex flex-wrap gap-4.5">
          <FooterLink href="/terms" muted>
            Terms
          </FooterLink>
          <FooterLink href="/privacy" muted>
            Privacy
          </FooterLink>
        </div>
      </div>
    </footer>
  );
}

/** The one part of the footer that costs a query, isolated so only it waits. */
async function DegradedDot() {
  const stages = await pipelineHealth();
  if (!anyDegraded(stages)) return null;

  return (
    <span
      aria-label="a stage is degraded"
      className="ml-1.5 inline-block h-1.5 w-1.5 rounded-[var(--radius-pill)] bg-[var(--color-sage-600)] align-middle [animation:breathe_1.6s_ease-in-out_infinite]"
    />
  );
}

function FooterHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
      {children}
    </div>
  );
}

function FooterLink({
  href,
  muted,
  children,
}: {
  href: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        muted
          ? "text-xs text-[var(--color-text-muted)] no-underline hover:text-[var(--color-text)]"
          : "text-sm no-underline hover:text-[var(--color-link-hover)]"
      }
    >
      {children}
    </Link>
  );
}

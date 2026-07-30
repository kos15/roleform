import Link from "next/link";
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
 */
export async function SiteFooter() {
  const stages = await pipelineHealth();
  const degraded = anyDegraded(stages);

  return (
    <footer className="mt-auto border-t border-[var(--color-line)] px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1.6rem,4vw,2.25rem)]">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-start justify-between gap-7">
        <div className="max-w-[34ch]">
          <div className="mb-2.5 flex items-center gap-[9px]">
            <BrandMark size={24} />
            <Wordmark size={16} />
          </div>
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            Your own words, retargeted. We reorder and reword what you wrote — we don&rsquo;t
            invent experience you don&rsquo;t have.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap gap-9">
          <div className="flex flex-col gap-2">
            <FooterHeading>Product</FooterHeading>
            <FooterLink href="/analyze">New analysis</FooterLink>
            <FooterLink href="/history">History</FooterLink>
            <FooterLink href="/profile">Profile</FooterLink>
            <FooterLink href="/status">
              Status
              {degraded ? (
                <span
                  aria-label="a stage is degraded"
                  className="ml-1.5 inline-block h-1.5 w-1.5 rounded-[var(--radius-pill)] bg-[var(--color-accent)] align-middle [animation:breathe_1.6s_ease-in-out_infinite]"
                />
              ) : null}
            </FooterLink>
          </div>

          <div className="flex flex-col gap-2">
            <FooterHeading>Company</FooterHeading>
            <FooterLink href="/how-it-works">How it works</FooterLink>
            <FooterLink href="/privacy">Privacy</FooterLink>
            <FooterLink href="/contact">Contact</FooterLink>
          </div>

          <div className="flex max-w-[26ch] flex-col gap-2.5">
            <FooterHeading>Support us</FooterHeading>
            <p className="text-xs leading-snug text-[var(--color-text-muted)]">
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

      <div className="mx-auto mt-6 flex max-w-[1180px] flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[var(--color-line)] pt-4">
        <span className="text-xs text-[var(--color-text-muted)]">
          Made by Kos in Bengaluru · © {new Date().getFullYear()} Roleform
        </span>
        <div className="flex flex-wrap gap-4.5">
          <FooterLink href="/terms" muted>
            Terms
          </FooterLink>
          <FooterLink href="/privacy" muted>
            Privacy
          </FooterLink>
          <FooterLink href="/changelog" muted>
            Changelog
          </FooterLink>
        </div>
      </div>
    </footer>
  );
}

function FooterHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
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
          : "text-[13px] no-underline hover:text-[var(--color-accent-700)]"
      }
    >
      {children}
    </Link>
  );
}

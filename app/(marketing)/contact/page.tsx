import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { PageIntro } from "@/components/page-intro";
import { CATALOG_EMAIL, PRIVACY_EMAIL, SUPPORT_EMAIL } from "@/lib/mail/addresses";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact · Roleform",
  description: "A person reads every one of these. No ticket queue and no bot.",
};

export default async function ContactPage() {
  // Public route, so there may be no session at all. When there is one, the
  // name and address come from Clerk rather than from us — we hold a hash of
  // the address and nothing else (N7), which is exactly why we can't prefill
  // this from our own database.
  const user = await currentUser();
  const defaultName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || undefined;
  const defaultEmail = user?.primaryEmailAddress?.emailAddress ?? undefined;

  return (
    <div className="mx-auto w-full max-w-[1000px] px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1.75rem,5vw,3.5rem)] pb-16">
      <PageIntro kicker="Contact" title="A person reads every one of these">
        There is no ticket queue and no bot. Two of us answer, usually within a working day.
      </PageIntro>

      <div className="flex flex-wrap items-start gap-6">
        <section className="min-w-[min(290px,100%)] flex-1 basis-[400px] rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-raised)] p-[clamp(1.25rem,3vw,1.625rem)]">
          <ContactForm defaultName={defaultName} defaultEmail={defaultEmail} />
        </section>

        <aside className="flex min-w-[min(250px,100%)] max-w-[330px] flex-1 basis-[260px] flex-col gap-3.5">
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] p-[1.125rem]">
            <div className="mb-3 text-[11px] uppercase tracking-[0.09em] text-[var(--color-text-muted)]">
              Direct
            </div>
            <div className="flex flex-col gap-2.5 text-[0.85rem]">
              {/* Configuration, not copy (lib/mail/addresses.ts) — a deployment
                  that routes support somewhere else should not have to edit a
                  page to say so. */}
              <div>
                <div className="font-semibold">Support</div>
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
              </div>
              <div>
                <div className="font-semibold">Privacy and deletion</div>
                <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>
              </div>
              <div>
                <div className="font-semibold">Catalog corrections</div>
                <a href={`mailto:${CATALOG_EMAIL}`}>{CATALOG_EMAIL}</a>
              </div>
            </div>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-[var(--color-sage-200)] bg-[var(--color-sage-100)] p-[1.125rem]">
            <div className="mb-2.5 text-[11px] uppercase tracking-[0.09em] text-[var(--color-sage-800)]">
              Before you write
            </div>
            <p className="mb-3 text-[0.8rem] leading-relaxed text-[var(--color-sage-900)]">
              A degraded stage is usually already known. The status page says which stage, and
              whether your run is parked rather than lost.
            </p>
            <Link href="/status" className="btn btn-secondary btn-sm no-underline">
              Check status
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

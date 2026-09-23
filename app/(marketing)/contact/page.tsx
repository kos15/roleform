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
    <div>
      <PageIntro kicker="Contact" title="A person reads every one of these">
        There is no ticket queue and no bot. Two of us answer, usually within a working day.
      </PageIntro>

      <div className="flex flex-wrap items-start gap-6">
        <section className="min-w-0 flex-[1_1_28rem] rounded-[var(--radius-xl)] bg-[var(--color-bg-raised)] p-[clamp(1.4rem,3vw,2.1rem)]">
          <ContactForm defaultName={defaultName} defaultEmail={defaultEmail} />
        </section>

        <aside className="flex min-w-0 flex-[0_1_22rem] flex-col gap-[18px]">
          <div className="rounded-[var(--radius-lg)] border-[1.5px] border-[var(--color-line)] px-6 py-[22px]">
            <div className="eyebrow mb-3.5">
              Direct
            </div>
            <div className="flex flex-col gap-3.5 text-[15px]">
              {/* Configuration, not copy (lib/mail/addresses.ts) — a deployment
                  that routes support somewhere else should not have to edit a
                  page to say so. */}
              <div>
                <div className="font-extrabold">Support</div>
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
              </div>
              <div>
                <div className="font-extrabold">Privacy and deletion</div>
                <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>
              </div>
              <div>
                <div className="font-extrabold">Catalog corrections</div>
                <a href={`mailto:${CATALOG_EMAIL}`}>{CATALOG_EMAIL}</a>
              </div>
            </div>
          </div>

          <div className="rounded-[var(--radius-lg)] bg-[var(--color-accent-500)] px-6 py-[22px]">
            <div className="eyebrow mb-2.5 text-[var(--color-text)]">
              Before you write
            </div>
            <p className="mb-4 text-[15px] leading-relaxed">
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

import type { Metadata } from "next";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "You're offline",
  robots: { index: false, follow: false },
};

// Cached once by the service worker (public/sw.js) and shown in place of any
// page the network can't reach. Static on purpose: it holds nobody's data.
export const dynamic = "force-static";

export default function Offline() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="nav">
        <span className="mr-auto flex items-center">
          <Brand />
        </span>
      </header>
      <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col justify-center px-[clamp(1.1rem,6vw,6rem)] py-[clamp(3rem,8vw,6rem)]">
        <p className="eyebrow mb-3.5">No connection</p>
        <h1 className="mb-5">You&rsquo;re offline</h1>
        <p className="mb-8 max-w-[52ch] text-[17px] leading-relaxed text-[var(--color-text-muted)]">
          Roleform keeps your résumés and prep on the server, not on this device, so they need a
          connection to open. Your round reminders still arrive once you&rsquo;re back online.
        </p>
        {/* A plain link, not next/link: a full navigation is what retries. */}
        <a href="/analyze" className="btn btn-primary w-fit no-underline">
          Try again
        </a>
      </main>
    </div>
  );
}

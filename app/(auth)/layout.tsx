import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";

/**
 * Chrome for the two auth surfaces.
 *
 * Neither the marketing header nor the app header fits here: one offers a "Sign
 * in" button to someone already on the sign-in page, the other assumes a
 * session. So this is the brand and a way back.
 */
/** Signed-in and auth surfaces are a person's own data, not search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="nav">
        <Link href="/" className="mr-auto flex items-center no-underline">
          <Brand />
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col items-center justify-center px-[clamp(1.1rem,6vw,6rem)] py-[clamp(2rem,5vw,4.5rem)]">
        {children}
      </main>
    </div>
  );
}

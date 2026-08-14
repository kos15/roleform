import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Chrome for the two auth surfaces.
 *
 * Neither the marketing header nor the app header fits here: one offers a "Sign
 * in" button to someone already on the sign-in page, the other assumes a
 * session. So this is the brand, a way back, and the theme toggle — because a
 * person who cannot read the form in the dark cannot sign in to fix it.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="nav">
        <Link href="/" className="mr-auto flex items-center gap-2.5 no-underline">
          <Brand />
        </Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-12">
        {children}
      </main>
    </div>
  );
}

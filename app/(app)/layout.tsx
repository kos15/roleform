import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { SiteFooter } from "@/components/site-footer";
import { db } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();

  // The chip says which role you are holding, because two of the nav links
  // behave differently depending on it and a 403 you could have predicted is a
  // worse 403. One indexed lookup; missing row just drops the label.
  const account = userId
    ? await db.user.findUnique({ where: { clerkUserId: userId }, select: { role: true } })
    : null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="nav">
        <Link href="/analyze" className="mr-auto flex items-center gap-2.5 no-underline">
          <Brand />
        </Link>

        <nav aria-label="Main" className="flex flex-wrap items-center gap-4 text-sm">
          {/* "New analysis" rather than "Analyze": from anywhere inside a finished
              analysis this link discards it and starts another, and the verb
              alone didn't say so. */}
          <Link href="/analyze">New analysis</Link>
          <Link href="/history" className="text-[var(--color-text-muted)]">
            History
          </Link>
          <Link href="/profile" className="text-[var(--color-text-muted)]">
            Profile
          </Link>
          {/* Shown to everyone on purpose. A member who clicks it gets a 403 that
              names the permission and the people who can grant it — which is more
              use than a link that quietly isn't there. */}
          <Link href="/admin" className="text-[var(--color-text-muted)]">
            Admin
          </Link>
          <Link href="/status" className="text-[var(--color-text-muted)]">
            Status
          </Link>
        </nav>

        <ThemeToggle />

        <div className="flex flex-none items-center gap-2">
          {account ? (
            <span className="hidden text-xs text-[var(--color-text-muted)] sm:inline">
              {account.role === "admin" ? "Admin" : "Member"}
            </span>
          ) : null}
          <UserButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>

      <SiteFooter />
    </div>
  );
}

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="nav">
        <Link href="/analyze" className="mr-auto flex items-center gap-2.5">
          <BrandMark />
          <span className="font-[family-name:var(--font-heading)] text-xl tracking-[-0.02em]">
            Roleform
          </span>
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
        </nav>

        <ThemeToggle />
        <UserButton />
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </>
  );
}

/** The mark: one corner square, three round — a form with a role. */
function BrandMark() {
  return (
    <span
      aria-hidden
      className="grid h-[27px] w-[27px] shrink-0 place-items-center rounded-[var(--radius-pill)]"
      style={{ background: "var(--color-accent-500)" }}
    >
      <span
        className="h-2.5 w-2.5"
        style={{
          background: "var(--color-bg)",
          borderRadius: "2px var(--radius-pill) var(--radius-pill) var(--radius-pill)",
        }}
      />
    </span>
  );
}

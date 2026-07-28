import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="nav">
        <Link href="/analyze" className="font-[family-name:var(--font-heading)] text-xl">
          Roleform
        </Link>
        <nav aria-label="Main" className="flex items-center gap-5 text-sm font-semibold">
          <Link href="/analyze">Analyze</Link>
          <Link href="/history">History</Link>
          <Link href="/profile">Profile</Link>
        </nav>
        <div className="ml-auto">
          <UserButton />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </>
  );
}

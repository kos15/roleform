"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The header's link group. The page you are on is set in the heavy weight,
 * which is the only "active" treatment the design uses — no underline, no
 * pill. A client component only because it needs the pathname.
 *
 * `match` lets one link claim several routes: "New analysis" is where you are
 * both while starting a run and while reading one.
 */
export function NavLinks({
  links,
  className,
}: {
  links: { href: string; label: string; match?: string[] }[];
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className={cn("nav-links", className)}>
      {links.map((link) => {
        const prefixes = link.match ?? [link.href];
        const on = prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
        return (
          <Link key={link.href} href={link.href} aria-current={on ? "page" : undefined}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

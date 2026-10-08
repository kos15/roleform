"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Code2, Timer } from "lucide-react";

/**
 * The three modes in the DS segmented control. Buttons rather than links
 * because `.seg` styles its direct button children; the route still changes,
 * so a mode is linkable and Back behaves. `data-pending` drives the same
 * breathe the tab bar uses while the next mode renders.
 */
export function RapidNav({ analysisId }: { analysisId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const base = `/analysis/${analysisId}/rapid`;
  const modes = [
    { href: base, label: "Revise", icon: BookOpen },
    { href: `${base}/quiz`, label: "Rapid round", icon: Timer },
    { href: `${base}/code`, label: "Code", icon: Code2 },
  ];

  return (
    <div className="seg" role="tablist" aria-label="Rapid prep modes">
      {modes.map(({ href, label, icon: Icon }) => {
        const selected = pathname === href;
        return (
          <button
            key={href}
            type="button"
            role="tab"
            aria-selected={selected}
            data-pending={pending && !selected ? "true" : undefined}
            onMouseEnter={() => router.prefetch(href)}
            onClick={() => startTransition(() => router.push(href))}
            className="inline-flex items-center gap-2 whitespace-nowrap"
          >
            <Icon className="lucide h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

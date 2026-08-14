"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { TEMPLATES } from "@/lib/render/templates";

/**
 * One chip per draft, rather than a select.
 *
 * The whole point of this screen is comparing layouts, and a closed select hides
 * every option but one behind a click. Laid out as chips they also read as a
 * set — you can see how many drafts exist without opening anything.
 */
export function TemplateSwitcher({
  analysisId,
  current,
  available,
}: {
  analysisId: string;
  current: string;
  available: string[];
}) {
  const router = useRouter();
  // Switching template re-renders the whole preview on the server. Without this
  // the chip stayed unselected for the length of the round trip and read as a
  // dropped click.
  const [pending, startTransition] = useTransition();
  const options = TEMPLATES.filter((t) => available.includes(t.id));

  return (
    <div
      className="flex flex-wrap gap-1.5 rounded-[var(--radius-lg)] border border-[var(--color-line)] p-3"
      style={{ background: "var(--color-bg-sunken)" }}
      aria-busy={pending || undefined}
    >
      {options.map((t) => {
        const selected = t.id === current;
        return (
          <button
            key={t.id}
            type="button"
            aria-current={selected ? "true" : undefined}
            disabled={pending}
            onClick={() =>
              startTransition(() => router.push(`/analysis/${analysisId}/preview/${t.id}`))
            }
            className="rounded-[var(--radius-pill)] border px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed"
            style={{
              borderColor: selected ? "var(--color-accent-500)" : "var(--color-line)",
              background: selected ? "var(--color-accent-500)" : "var(--color-bg)",
              color: selected ? "var(--color-on-accent)" : "var(--color-text)",
            }}
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}

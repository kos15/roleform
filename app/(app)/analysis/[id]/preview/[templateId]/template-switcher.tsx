"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { TEMPLATES } from "@/lib/render/templates";

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
  // Switching template re-renders the whole diff on the server. Without this the
  // select snapped back to the old value for the length of the round trip and
  // read as a dropped click.
  const [pending, startTransition] = useTransition();
  const options = TEMPLATES.filter((t) => available.includes(t.id));

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-semibold text-[var(--color-text-muted)]">Template</span>
      <select
        className="input w-auto"
        value={current}
        aria-busy={pending || undefined}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(() => router.push(`/analysis/${analysisId}/preview/${next}`));
        }}
      >
        {options.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}

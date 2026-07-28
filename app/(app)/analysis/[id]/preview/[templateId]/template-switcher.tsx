"use client";

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
  const options = TEMPLATES.filter((t) => available.includes(t.id));

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-semibold text-[var(--color-text-muted)]">Template</span>
      <select
        className="input w-auto"
        value={current}
        onChange={(e) => router.push(`/analysis/${analysisId}/preview/${e.target.value}`)}
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

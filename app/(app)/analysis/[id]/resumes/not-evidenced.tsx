import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Card, Tag } from "@/components/ui";
import type { NotEvidencedItem } from "@/lib/domain/coverage";

/**
 * The posting's absent requirements, once per analysis, under the drafts.
 * Read-only: it reads coverage and inserts nothing into any draft (N1, N3,
 * specs §3) — the gap goes to Learning, not into a bullet.
 */
export function NotEvidencedPanel({
  analysisId,
  items,
}: {
  analysisId: string;
  items: NotEvidencedItem[];
}) {
  if (items.length === 0) return null;
  return (
    <Card flat className="mt-8">
      <h3 className="mb-2">Still not evidenced</h3>
      <p className="mb-3 text-sm leading-normal text-[var(--color-text-muted)]">
        The posting asks for these; your profile doesn&rsquo;t show them, so no draft claims them.
      </p>
      <div className="mb-3.5 flex flex-wrap gap-1.5">
        {items.map((item) => (
          // A label is either a short skill or a whole requirement sentence;
          // only the latter needs to wrap.
          <Tag key={item.label} tone="sage" className={item.label.length > 28 ? "tag-long" : undefined}>
            {item.label}
          </Tag>
        ))}
      </div>
      <Link
        href={`/analysis/${analysisId}/learning?skills=${encodeURIComponent(items.map((i) => i.label).join(","))}`}
        className="inline-flex items-center gap-1.5 text-sm font-extrabold underline underline-offset-[3px]"
      >
        <GraduationCap className="lucide h-4 w-4" /> See courses for these
      </Link>
    </Card>
  );
}

import Link from "next/link";
import { Tag } from "@/components/ui";
import type { CapWall } from "@/lib/domain/quotas";

/**
 * The inline cap wall for `/jobs` (JS-9). Not a dialog — the page itself
 * carries the refusal, because nothing has been attempted yet for a dialog
 * to be responding to. Free reads this and nothing else on the page; no
 * outbound request happens either way.
 */
export function CapNotice({ wall }: { wall: CapWall }) {
  return (
    <section
      className="mb-8 rounded-[var(--radius-lg)] border p-[clamp(1.25rem,3vw,1.75rem)]"
      style={{ borderColor: "var(--color-accent-300)", background: "var(--color-accent-100)" }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <Tag tone="accent">Off on your plan</Tag>
      </div>
      <h2 className="mb-2 text-[1.3rem]">Job search is a Pro feature</h2>
      <p className="mb-4 max-w-[56ch] text-sm leading-relaxed text-[var(--color-accent-800)]">
        The analysis underneath — coverage, résumés, prep, the roadmap — is the same on every plan.
        Job search is gated by plan, not by quality.
      </p>
      <div className="flex flex-wrap gap-2">
        {wall.upgrade ? (
          <Link href="/pricing" className="btn btn-primary no-underline">
            Go {wall.upgrade.name}
          </Link>
        ) : null}
        <Link href="/pricing" className="btn btn-ghost no-underline">
          Compare plans
        </Link>
      </div>
    </section>
  );
}

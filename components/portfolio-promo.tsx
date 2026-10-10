import Link from "next/link";
import { ArrowRight, Globe } from "lucide-react";

/**
 * F28 — the promotion for the portfolio studio, on the Resumes tab beside the
 * drafts it grows out of. The glow is the one place the product raises its
 * voice; it is decoration only (`aria-hidden`), built from the marigold and
 * pink ramps, and it stops moving under prefers-reduced-motion.
 */
export function PortfolioPromo({ analysisId, used }: { analysisId: string; used: boolean }) {
  return (
    <div className="promo-glow mt-9">
      <Link
        href={`/analysis/${analysisId}/portfolio`}
        className="card card-link flex flex-wrap items-center gap-5 px-[clamp(1.25rem,3vw,2rem)] py-6 no-underline"
      >
        <span className="grid h-14 w-14 flex-none place-items-center rounded-[var(--radius-pill)] bg-[var(--color-accent-500)]">
          <Globe className="lucide h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1 basis-64">
          <span className="eyebrow mb-1 block">New · Portfolio site</span>
          <span className="display block text-[clamp(1.4rem,2.6vw,1.9rem)] leading-[1.05]">
            Same evidence, as a website
          </span>
          <span className="mt-1.5 block text-[15px] text-[var(--color-text-muted)]">
            {used
              ? "Your portfolio is built. Open it to download, or copy the free prompt for more versions."
              : "Fourteen looks, nine of them animated, your own photos, your profile as the copy. Copy a curated prompt for free, or let us build the page once, here."}
          </span>
        </span>
        <span className="btn btn-primary flex-none">
          {used ? "Open portfolio" : "Make my portfolio"} <ArrowRight className="lucide h-4 w-4" />
        </span>
      </Link>
    </div>
  );
}

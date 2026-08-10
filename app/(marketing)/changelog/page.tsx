import type { Metadata } from "next";
import { Bullet, PageIntro } from "@/components/page-intro";
import { Tag } from "@/components/ui";
import { CHANGELOG, type ReleaseKind } from "@/lib/content/changelog";

export const metadata: Metadata = {
  title: "Changelog · Roleform",
  description: "Every release, including the ones that only fixed something we got wrong.",
};

/** A fix is not a lesser release, so it gets a tone rather than being hidden. */
const TONE: Record<ReleaseKind, "accent" | "sage" | "warn" | "muted"> = {
  Release: "accent",
  Feature: "accent",
  Improvement: "sage",
  Fix: "muted",
};

export default function ChangelogPage() {
  return (
    <div className="mx-auto w-full max-w-[800px] px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1.75rem,5vw,3.5rem)] pb-16">
      <PageIntro kicker="Changelog" title="What changed, and when">
        Every release, including the ones that only fixed something we got wrong. Fixes are
        listed as plainly as features.
      </PageIntro>

      <div className="mt-8 flex flex-col gap-3.5">
        {CHANGELOG.map((release) => (
          <article
            key={release.version}
            className="flex flex-wrap gap-5 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-raised)] px-[1.375rem] py-5"
          >
            <div className="min-w-[118px] flex-none basis-32">
              <div className="mb-1.5 font-[family-name:var(--font-heading)] text-[1.375rem] leading-none">
                {release.version}
              </div>
              <div className="mb-2.5 text-xs text-[var(--color-text-muted)]">{release.date}</div>
              <Tag tone={TONE[release.kind]}>{release.kind}</Tag>
            </div>

            <div className="flex min-w-[min(220px,100%)] flex-1 basis-[300px] flex-col gap-2.5">
              {release.items.map((item) => (
                <Bullet key={item}>{item}</Bullet>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

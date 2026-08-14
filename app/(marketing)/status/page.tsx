import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { BrandMark } from "@/components/brand";
import { Tag } from "@/components/ui";
import { anyDegraded, pipelineHealth } from "@/lib/status/health";
import { stalledRun } from "@/lib/status/stalled";
import { STAGES } from "@/lib/pipeline/stages";
import { RefreshRing } from "./refresh-ring";

export const metadata: Metadata = {
  title: "Status · Roleform",
  description: "Per-stage health for the four-stage pipeline, and whether your run stopped part-way.",
};

/** Health is a live read; a cached status page is a contradiction. */
export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const { userId } = await auth();
  const [stages, stalled] = await Promise.all([
    pipelineHealth(),
    userId ? stalledRun(userId) : Promise.resolve(null),
  ]);

  const degraded = anyDegraded(stages);
  const degradedStages = stages.filter((s) => s.state === "degraded");

  return (
    <div className="mx-auto w-full max-w-[860px] px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1.75rem,5vw,3.75rem)] pb-16">
      <div className="mb-7 flex flex-wrap items-center gap-6">
        <div className={degraded ? "[animation:breathe_2.6s_ease-in-out_infinite]" : undefined}>
          <BrandMark size={76} />
        </div>
        <div className="min-w-[min(260px,100%)] flex-1">
          <div className="card-kicker mb-2">
            {degraded
              ? `Partial outage · ${degradedStages.length} of ${STAGES.length} stages degraded`
              : `All ${STAGES.length} stages operational`}
          </div>
          <h1 className="mb-2 text-[clamp(1.625rem,4vw,2.25rem)]">
            {degraded
              ? `${degradedStages[0].label} is degraded. The rest is fine.`
              : "Everything is running."}
          </h1>
          <p className="text-[0.9rem] leading-relaxed text-[var(--color-text-muted)]">
            {degraded
              ? "One stage is at reduced capacity, so we're telling you which — and what still works — instead of showing you a whole-product error."
              : "Each stage reports from what actually ran in the last hour, not from a switch we flip by hand. A quiet stage says it is quiet rather than claiming a clean bill of health."}
          </p>
        </div>
      </div>

      <div className="mb-4.5 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)]">
        {stages.map((stage) => {
          const bad = stage.state === "degraded";
          return (
            <div
              key={stage.key}
              className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-bg-raised)] px-[1.125rem] py-4 last:border-b-0"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 flex-none rounded-[var(--radius-pill)]"
                style={{
                  background: bad ? "var(--color-accent)" : "var(--color-sage-600)",
                  animation: bad ? "breathe 1.3s ease-in-out infinite" : undefined,
                }}
              />
              <div className="min-w-0 flex-1 basis-[220px]">
                <div className="mb-0.5 text-[0.95rem] font-semibold">{stage.label}</div>
                <div className="text-xs leading-snug text-[var(--color-text-muted)]">
                  {stage.note}
                </div>
              </div>
              <Tag tone={bad ? "accent" : "sage"} className="flex-none">
                {bad ? "Degraded" : "Operational"}
              </Tag>
            </div>
          );
        })}
      </div>

      <div className="mb-5 flex flex-wrap gap-4">
        {stalled ? (
          <div className="min-w-[min(280px,100%)] flex-1 basis-80 rounded-[var(--radius-lg)] border border-[var(--color-sage-200)] bg-[var(--color-sage-100)] p-5">
            {/* Deliberately not "parked": that word means a posting filed
                against your allowance, which has cost nothing and started
                nothing. This one started. */}
            <div className="mb-3 text-[11px] uppercase tracking-[0.09em] text-[var(--color-sage-800)]">
              Your run stopped part-way, not lost
            </div>
            <p className="mb-3.5 text-[0.85rem] leading-relaxed text-[var(--color-sage-900)]">
              {stalled.label} — stopped part-way through stage {stalled.stageIndex + 1}. It picks up
              at &ldquo;{STAGES[stalled.stageIndex].label.toLowerCase()}&rdquo; rather than starting
              over, and the posting is already parsed.
            </p>
            <div className="h-2 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--color-bg)]">
              <div
                className="h-full rounded-[var(--radius-pill)] bg-[var(--color-sage-600)]"
                style={{ width: `${stalled.progressPct}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[11.5px] text-[var(--color-sage-800)]">
              <span>
                Stage {stalled.stageIndex + 1} of {STAGES.length}
              </span>
              <span>{stalled.progressPct}%</span>
            </div>
            <Link
              href={`/analysis/${stalled.id}`}
              className="btn btn-secondary btn-sm mt-3.5 no-underline"
            >
              Open it
            </Link>
          </div>
        ) : (
          <div className="min-w-[min(280px,100%)] flex-1 basis-80 rounded-[var(--radius-lg)] border border-[var(--color-line)] p-5">
            <div className="mb-3 text-[11px] uppercase tracking-[0.09em] text-[var(--color-text-muted)]">
              Your runs
            </div>
            <p className="text-[0.85rem] leading-relaxed text-[var(--color-text-muted)]">
              {userId
                ? "Nothing of yours is mid-run. A run that stops part-way shows up here with the stage it will resume from."
                : "Sign in and this panel says whether one of your own runs is parked, and at which stage."}
            </p>
          </div>
        )}

        <RefreshRing />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Link href="/history" className="btn btn-primary no-underline">
          Read the parts that finished
        </Link>
        <Link href="/contact" className="btn btn-ghost no-underline">
          Tell us something is wrong
        </Link>
        <span className="min-w-[min(200px,100%)] flex-1 text-xs text-[var(--color-text-muted)]">
          Coverage, questions and course matches already written for a posting stay readable while
          a later stage catches up.
        </span>
      </div>
    </div>
  );
}

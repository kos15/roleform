import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { BrandMark } from "@/components/brand";
import { Tag } from "@/components/ui";
import { anyDegraded, pipelineHealth } from "@/lib/status/health";
import { stalledRun } from "@/lib/status/stalled";
import { STAGES } from "@/lib/pipeline/stages";
import { RefreshRing } from "./refresh-ring";

export const metadata: Metadata = pageMetadata({
  title: "System status",
  description:
    "Live, per-stage health of the Roleform pipeline — and whether your own run stopped part-way.",
  path: "/status",
  markdown: false,
});

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
    <div className="max-w-[980px]">
      <div className="mb-[clamp(1.75rem,4vw,2.75rem)] flex flex-wrap items-center gap-[clamp(1.25rem,3vw,2.25rem)]">
        <div
          className={`grid h-[108px] w-[108px] flex-none place-items-center rounded-[32px] ${
            degraded
              ? "bg-[var(--color-sage-500)] [animation:breathe_2.6s_ease-in-out_infinite]"
              : "bg-[var(--color-bg-raised)]"
          }`}
        >
          <BrandMark size={72} />
        </div>
        <div className="min-w-0 flex-[1_1_300px]">
          <div className="eyebrow mb-3">
            {degraded
              ? `Partial outage · ${degradedStages.length} of ${STAGES.length} stages degraded`
              : `All ${STAGES.length} stages operational`}
          </div>
          <h1 className="mb-3.5 text-[clamp(2.6rem,5.4vw,5rem)] leading-[0.92]">
            {degraded
              ? `${degradedStages[0].label} is degraded. The rest is fine.`
              : "Everything is running."}
          </h1>
          <p className="max-w-[62ch] text-[16.5px] leading-relaxed text-[var(--color-text-muted)]">
            {degraded
              ? "One stage is at reduced capacity, so we're telling you which — and what still works — instead of showing you a whole-product error."
              : "Each stage reports from what actually ran in the last hour, not from a switch we flip by hand. A quiet stage says it is quiet rather than claiming a clean bill of health."}
          </p>
        </div>
      </div>

      <div className="mb-5 overflow-hidden rounded-[26px] bg-[var(--color-bg-raised)]">
        {stages.map((stage) => {
          const bad = stage.state === "degraded";
          return (
            <div
              key={stage.key}
              className={`flex flex-wrap items-center gap-3.5 border-b border-[rgb(74_13_13/0.08)] px-6 py-5 last:border-b-0 ${
                bad ? "bg-[var(--color-sage-100)]" : ""
              }`}
            >
              <span
                aria-hidden
                className="h-3 w-3 flex-none rounded-[var(--radius-pill)]"
                style={{
                  background: bad ? "var(--color-sage-600)" : "var(--color-text)",
                  animation: bad ? "breathe 1.3s ease-in-out infinite" : undefined,
                }}
              />
              <div className="min-w-0 flex-1 basis-[240px]">
                <div className="mb-[3px] text-[17px] font-extrabold">{stage.label}</div>
                <div className="text-sm leading-normal text-[var(--color-text-muted)]">
                  {stage.note}
                </div>
              </div>
              <Tag tone={bad ? "sage" : "warn"} className="min-h-8 flex-none px-3.5 text-[13px] font-extrabold">
                {bad ? "Degraded" : "Operational"}
              </Tag>
            </div>
          );
        })}
      </div>

      <div className="mb-7 flex flex-wrap gap-[18px]">
        {stalled ? (
          <div className="min-w-0 flex-[1_1_320px] rounded-[var(--radius-lg)] bg-[var(--color-sage-500)] px-6 py-[22px]">
            {/* Deliberately not "parked": that word means a posting filed
                against your allowance, which has cost nothing and started
                nothing. This one started. */}
            <div className="eyebrow mb-2.5 text-[var(--color-text)]">
              Your run stopped part-way, not lost
            </div>
            <p className="mb-4 text-[15px] leading-relaxed">
              {stalled.label} — stopped part-way through stage {stalled.stageIndex + 1}. It picks up
              at &ldquo;{STAGES[stalled.stageIndex].label.toLowerCase()}&rdquo; rather than starting
              over, and the posting is already parsed.
            </p>
            <div className="h-2.5 overflow-hidden rounded-[var(--radius-pill)] bg-[rgb(255_255_255/0.55)]">
              <div
                className="h-full rounded-[var(--radius-pill)] bg-[var(--color-text)]"
                style={{ width: `${stalled.progressPct}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[12.5px] font-bold">
              <span>
                Stage {stalled.stageIndex + 1} of {STAGES.length}
              </span>
              <span>{stalled.progressPct}%</span>
            </div>
            <Link
              href={`/analysis/${stalled.id}`}
              className="btn btn-secondary btn-sm mt-4 no-underline"
            >
              Open it
            </Link>
          </div>
        ) : (
          <div className="min-w-0 flex-[1_1_320px] rounded-[var(--radius-lg)] border-[1.5px] border-[var(--color-line)] px-6 py-[22px]">
            <div className="eyebrow mb-2.5">
              Your runs
            </div>
            <p className="text-[15px] leading-relaxed text-[var(--color-text-muted)]">
              {userId
                ? "Nothing of yours is mid-run. A run that stops part-way shows up here with the stage it will resume from."
                : "Sign in and this panel says whether one of your own runs is parked, and at which stage."}
            </p>
          </div>
        )}

        <RefreshRing />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Link href="/history" className="btn btn-primary min-h-12 no-underline">
          Read the parts that finished
        </Link>
        <Link href="/contact" className="btn btn-ghost min-h-12 no-underline">
          Tell us something is wrong
        </Link>
        <span className="min-w-[min(220px,100%)] flex-1 text-[13px] leading-normal text-[var(--color-text-muted)]">
          Coverage, questions and course matches already written for a posting stay readable while
          a later stage catches up.
        </span>
      </div>
    </div>
  );
}

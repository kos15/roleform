import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getAnalysis } from "@/lib/db/queries/analysis";
import { getStudyContext } from "@/lib/db/queries/study";
import { localDate } from "@/lib/domain/study-plan";
import { pushConfigured } from "@/lib/services/push/send";
import { EmptyState } from "@/components/ui";
import { SectionPending } from "@/components/background-pending";
import { backgroundRunning } from "@/lib/services/pipeline/background";
import { StudyPlanClient } from "./study-plan-client";
import { requireFeaturePage } from "@/lib/services/features";

export const metadata = { title: "Study plan" };

/**
 * F30 — the study plan: every gap's learning steps fitted into the member's
 * week before the interview. The page hands the client the rows and the
 * member's choices; the schedule is solved in the browser on every change by
 * the same pure function the server uses for alerts (lib/domain/study-plan.ts).
 * No model call, no cap, no `ai_runs` row.
 */
export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  // F31: switched off site-wide → a plain 404.
  await requireFeaturePage("study");
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/");

  const analysis = await getAnalysis(userId, id);
  if (!analysis) redirect("/history");
  if (analysis.status !== "ready") redirect(`/analysis/${id}`);

  const ctx = await getStudyContext(userId, id);
  if (ctx.topics.length === 0 && backgroundRunning(analysis)) {
    return (
      <SectionPending title="Waiting on your learning plan">
        The study plan is built from the courses your Learning tab recommends, which are still
        being matched. This tab fills in on its own.
      </SectionPending>
    );
  }

  if (ctx.topics.length === 0) {
    return (
      <EmptyState title="Nothing to plan">
        No gap on this posting has a vetted course to study, so there is nothing to put on a calendar. We&rsquo;d
        rather show you an empty plan than pad it.
      </EmptyState>
    );
  }

  return (
    <StudyPlanClient
      analysisId={id}
      company={analysis.company}
      title={analysis.title}
      topics={ctx.topics}
      uncovered={ctx.uncovered}
      initialSettings={ctx.settings}
      initialTicks={ctx.ticks}
      nextRoundOn={ctx.nextRoundOn}
      // The browser corrects this to its own zone on mount; the server's guess
      // keeps the first paint close.
      serverToday={localDate(new Date(), ctx.timeZone ?? "UTC")}
      pushReady={pushConfigured()}
    />
  );
}

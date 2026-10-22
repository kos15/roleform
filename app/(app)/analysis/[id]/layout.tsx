import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import {
  getAnalysis,
  getBulletTexts,
  getCoverage,
  getRequirements,
  getTabCounts,
} from "@/lib/db/queries/analysis";
import { getStudyTabCount } from "@/lib/db/queries/study";
import { readStageState } from "@/lib/pipeline/stages";
import { backgroundRunning } from "@/lib/pipeline/background";
import { BackgroundRefresh } from "@/components/background-pending";
import { ResultsHeader } from "./results-header";
import { AnalysisTabs } from "./analysis-tabs";
import { featureStates } from "@/lib/features";
import { PromoMarquee } from "@/components/promo-marquee";

/**
 * F4 — results header, always adjacent to the three buckets (N4).
 *
 * This layout wraps the three tabs, so the number and its buckets travel
 * together. The score is never rendered without them.
 */
export default async function AnalysisLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/");

  // Issued together, not chained. The database is in one region and these are
  // three sequential round trips otherwise — the requirement and coverage reads
  // are already scoped by user and analysis, so speculating on them costs a
  // wasted query on the parsing path and saves a full round trip on every other
  // one. Only `bulletTexts` genuinely depends on a prior result.
  const [analysis, requirements, coverage, tabCounts, study, features] = await Promise.all([
    getAnalysis(userId, id),
    getRequirements(userId, id),
    getCoverage(userId, id),
    getTabCounts(userId, id),
    getStudyTabCount(userId, id),
    featureStates(),
  ]);
  // F31: a switched-off surface loses its tab as well as its page.
  const hidden = [
    !features.study && "schedule",
    !features.roadmap && "roadmap",
    !features.rapid && "rapid",
    !features.rounds && "rounds",
  ].filter((slug): slug is string => Boolean(slug));
  const counts = { ...tabCounts, study };
  if (!analysis) redirect("/history");
  if (analysis.status !== "ready") return <>{children}</>;

  const evidenceIds = [...new Set(coverage.flatMap((c) => c.evidenceBulletIds))];
  const bulletTexts = await getBulletTexts(userId, evidenceIds);
  // G4: what stage ① actually did to the posting before it was ever read —
  // truncated for length, or a requirement excluded under IN-6 — surfaced
  // once, plainly, rather than left in a column nothing renders.
  const stageState = readStageState(analysis.stageState);
  // Prep and Learning still landing behind the résumés: one poller for the
  // whole analysis, and the tabs that wait on them say so.
  const generating = backgroundRunning(analysis);

  return (
    <div>
      <PromoMarquee />
      <ResultsHeader
        analysis={{
          jdSource: analysis.jdSource,
          jdFilename: analysis.jdFilename,
          company: analysis.company,
          title: analysis.title,
          location: analysis.location,
          seniority: analysis.seniority,
          employmentType: analysis.employmentType,
          score: Number(analysis.score ?? 0),
          scoreVerdict: analysis.scoreVerdict ?? "",
          scoreNote: analysis.scoreNote ?? "",
          truncated: stageState.truncated,
          protectedNotice: stageState.protectedNotice,
          // F22 §3.5 — this run started as "Analyse" on a saved listing.
          fromSavedJob: analysis.listingId !== null,
        }}
        requirements={requirements}
        coverage={coverage}
        bulletTexts={Object.fromEntries(bulletTexts)}
      />
      <div className="mb-[clamp(1.75rem,3vw,2.5rem)] mt-[clamp(2.75rem,5vw,4rem)] h-px bg-[var(--color-line)]" />
      {generating ? <BackgroundRefresh /> : null}
      <AnalysisTabs analysisId={id} counts={counts} hidden={hidden} generating={generating} />
      <div className="mt-[clamp(2.25rem,4vw,3.5rem)]">{children}</div>
    </div>
  );
}

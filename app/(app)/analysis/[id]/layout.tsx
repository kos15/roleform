import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import {
  getAnalysis,
  getBulletTexts,
  getCoverage,
  getRequirements,
} from "@/lib/db/queries/analysis";
import { ResultsHeader } from "./results-header";
import { AnalysisTabs } from "./analysis-tabs";

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
  const [analysis, requirements, coverage] = await Promise.all([
    getAnalysis(userId, id),
    getRequirements(userId, id),
    getCoverage(userId, id),
  ]);
  if (!analysis) redirect("/history");
  if (analysis.status !== "ready") return <>{children}</>;

  const evidenceIds = [...new Set(coverage.flatMap((c) => c.evidenceBulletIds))];
  const bulletTexts = await getBulletTexts(userId, evidenceIds);

  return (
    <div className="space-y-8">
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
        }}
        requirements={requirements}
        coverage={coverage}
        bulletTexts={Object.fromEntries(bulletTexts)}
      />
      <AnalysisTabs analysisId={id} />
      {children}
    </div>
  );
}

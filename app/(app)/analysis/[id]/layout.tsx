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

  const analysis = await getAnalysis(userId, id);
  if (!analysis) redirect("/history");
  if (analysis.status !== "ready") return <>{children}</>;

  const [requirements, coverage] = await Promise.all([
    getRequirements(userId, id),
    getCoverage(userId, id),
  ]);

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

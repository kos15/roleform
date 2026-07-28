import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getAnalysis } from "@/lib/db/queries/analysis";
import { ParsingScreen } from "./parsing-screen";

/**
 * The analysis entry point.
 *
 * A run still parsing gets the streamed parsing screen (F3); a finished one
 * goes straight to results, with no regeneration and no re-billing (F10).
 */
export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/");

  const analysis = await getAnalysis(userId, id);
  if (!analysis) redirect("/history");

  if (analysis.status === "ready") redirect(`/analysis/${id}/resumes`);

  return <ParsingScreen analysisId={id} initialStatus={analysis.status} note={analysis.scoreNote} />;
}

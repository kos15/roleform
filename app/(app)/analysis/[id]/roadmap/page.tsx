import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getAnalysis } from "@/lib/db/queries/analysis";
import { getRoadmap } from "@/lib/db/queries/roadmap";
import { EmptyState } from "@/components/ui";
import { Checklist } from "./checklist";
import { BuildButton } from "./build-button";

/**
 * F21 — Roadmap. Compiled once, on demand, from rows the analysis already
 * holds. No tab here generates anything — building costs zero tokens
 * (N13), and ticking is the user's own record of working through it (N15).
 */
export default async function RoadmapTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/");

  // Same guard as the other three tabs: until the run is `ready` there is no
  // header and no tab bar to stand under.
  const analysis = await getAnalysis(userId, id);
  if (!analysis) redirect("/history");
  if (analysis.status !== "ready") redirect(`/analysis/${id}`);

  const roadmap = await getRoadmap(userId, id);

  if (!roadmap) {
    return (
      <div className="max-w-xl" data-tour="roadmap">
        <EmptyState title="A checklist for this posting, not a list of courses">
          One button compiles the likely questions, the technical ones worth a full answer, every
          learning step your plan produced, and the basics — into one ordered checklist you tick
          through. Nothing here is generated; it is assembled from what this analysis already made.
        </EmptyState>
        <div className="mt-5">
          <BuildButton analysisId={id} />
        </div>
      </div>
    );
  }

  return (
    <div data-tour="roadmap">
      <Checklist items={roadmap.items} />
    </div>
  );
}

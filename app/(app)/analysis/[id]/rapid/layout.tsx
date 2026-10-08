import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getAnalysis } from "@/lib/db/queries/analysis";
import { SectionTitle } from "@/components/ui";
import { RapidNav } from "./rapid-nav";

/**
 * F26 — Rapid prep. Three drills on the posting's own topics, one route each
 * so a mode is linkable and Back behaves:
 *
 *   /rapid        Revise — cards sized to the time you have
 *   /rapid/quiz   Rapid round — timed multiple choice, graded by the server
 *   /rapid/code   Code — a timed challenge with hints, solution and review
 *
 * Same guard as the other tabs: until the run is `ready` the parent layout
 * draws no tab bar, so this surface would be an orphan.
 */
export default async function RapidLayout({
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
  if (analysis.status !== "ready") redirect(`/analysis/${id}`);

  return (
    <section>
      <SectionTitle sub="Revise the posting's topics, test yourself against the clock, then solve one under interview conditions. Everything here is drawn from what this posting asks for.">
        Rapid prep
      </SectionTitle>
      <RapidNav analysisId={id} />
      <div className="mt-8">{children}</div>
    </section>
  );
}

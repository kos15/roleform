import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getAnalysis, getAnswers, getBulletTexts, getQuestions } from "@/lib/db/queries/analysis";
import { EmptyState } from "@/components/ui";
import { QuestionList } from "./question-list";
import type { QuestionType } from "./types";

/**
 * F7 — Tab 2: Prep.
 *
 * Every non-gap question carries evidence (N2), enforced by a database CHECK —
 * so `Pull from:` can never render empty. Gap questions coach honest
 * positioning and never script a claim the user can't make.
 *
 * F7.2 adds worked answers for the technical and system-design families, where
 * three points of scaffolding are genuinely not enough to rehearse against.
 * Which questions already HAVE one is server state, so it is resolved here and
 * handed down — the client component never has to guess whether a click will
 * cost a model call.
 */
export default async function PrepTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/");

  // Same guard as the other two tabs: until the run is `ready` the layout draws
  // no header and no tab bar, so this page would be an orphan.
  const [analysis, questions] = await Promise.all([
    getAnalysis(userId, id),
    getQuestions(userId, id),
  ]);
  if (!analysis) redirect("/history");
  if (analysis.status !== "ready") redirect(`/analysis/${id}`);

  if (questions.length === 0) {
    return (
      <EmptyState title="Prep didn't generate for this posting">
        Your résumés and match are unaffected — a failure on one surface never takes the rest of
        the analysis with it. There is no way to re-run this tab on its own; running the posting
        again is a fresh analysis, and it is charged like one.
      </EmptyState>
    );
  }

  const bulletIds = [...new Set(questions.flatMap((q) => q.evidenceBulletIds))];
  const [bulletTexts, answers] = await Promise.all([
    getBulletTexts(userId, bulletIds),
    getAnswers(userId, id),
  ]);

  return (
    <QuestionList
      answeredIds={[...answers.keys()]}
      questions={questions.map((q) => ({
        id: q.id,
        type: q.type as QuestionType,
        text: q.text,
        likely: q.likely,
        whyTheyAsk: q.whyTheyAsk,
        frame: q.frame,
        evidence: q.evidenceBulletIds.map((bid) => bulletTexts.get(bid) ?? "").filter(Boolean),
      }))}
    />
  );
}

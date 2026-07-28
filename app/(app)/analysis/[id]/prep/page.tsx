import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getBulletTexts, getQuestions } from "@/lib/db/queries/analysis";
import { EmptyState } from "@/components/ui";
import { QuestionList } from "./question-list";

/**
 * F7 — Tab 2: Prep.
 *
 * Every non-gap question carries evidence (N2), enforced by a database CHECK —
 * so `Pull from:` can never render empty. Gap questions coach honest
 * positioning and never script a claim the user can't make.
 */
export default async function PrepTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/");

  const questions = await getQuestions(userId, id);
  if (questions.length === 0) {
    return (
      <EmptyState title="Prep didn't generate for this posting">
        Your résumés and match are unaffected. You can re-run just this tab from History.
      </EmptyState>
    );
  }

  const bulletIds = [...new Set(questions.flatMap((q) => q.evidenceBulletIds))];
  const bulletTexts = await getBulletTexts(userId, bulletIds);

  return (
    <QuestionList
      questions={questions.map((q) => ({
        id: q.id,
        type: q.type,
        text: q.text,
        likely: q.likely,
        whyTheyAsk: q.whyTheyAsk,
        frame: q.frame,
        evidence: q.evidenceBulletIds.map((bid) => bulletTexts.get(bid) ?? "").filter(Boolean),
      }))}
    />
  );
}

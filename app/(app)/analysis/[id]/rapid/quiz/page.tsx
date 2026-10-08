import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getRoundSummaries } from "@/lib/db/queries/drill";
import { QuizRound } from "./quiz-round";

/**
 * F26 — Rapid round. Timed multiple choice on the posting's topics. The
 * answers stay on the server until the round is submitted, and the grade is a
 * count computed there — "7 of 10", never a percentage (N16).
 */
export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/");
  const rounds = await getRoundSummaries(userId, id);
  return <QuizRound analysisId={id} rounds={rounds} />;
}

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getRoundSummaries } from "@/lib/db/queries/drill";
import { QuizRound } from "./quiz-round";

/**
 * The server actions behind this mode run under this route's limits and each
 * can make a model call (a generated challenge is the longest, with its
 * sandbox re-check and one corrective retry). Stated explicitly so a change
 * to the project's default can't cut a generation off mid-call.
 */
export const maxDuration = 120;

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

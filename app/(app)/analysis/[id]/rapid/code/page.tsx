import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getChallengeSummaries, getChallengeView } from "@/lib/db/queries/drill";
import { BANK } from "@/lib/drill/bank";
import { CodeChallenge } from "./code-challenge";

/**
 * The server actions behind this mode run under this route's limits and each
 * can make a model call (a generated challenge is the longest, with its
 * sandbox re-check and one corrective retry). Stated explicitly so a change
 * to the project's default can't cut a generation off mid-call.
 */
export const maxDuration = 120;

/**
 * F26 — Code. A timed challenge: a classic DSA problem from the curated bank
 * (zero tokens) or one generated from this posting's technical topics, in the
 * language and difficulty you choose — with hints, the full solution, and a
 * review on correctness, time and space complexity, and the clock.
 *
 * `?c=<id>` reopens a challenge, so a refresh mid-challenge keeps your place
 * and the server's clock.
 */
export default async function CodePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const [{ id }, { c }] = await Promise.all([params, searchParams]);
  const { userId } = await auth();
  if (!userId) redirect("/");

  const [summaries, open] = await Promise.all([
    getChallengeSummaries(userId, id),
    c ? getChallengeView(userId, c) : Promise.resolve(null),
  ]);

  return (
    <CodeChallenge
      analysisId={id}
      summaries={summaries}
      initial={open}
      bank={BANK.map((p) => ({ slug: p.slug, title: p.title, difficulty: p.difficulty, topic: p.topic }))}
    />
  );
}

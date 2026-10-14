import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getDecks } from "@/lib/db/queries/drill";
import { RevisionDeck } from "./revision-deck";

/**
 * The server actions behind this mode run under this route's limits and each
 * can make a model call (a generated challenge is the longest, with its
 * sandbox re-check and one corrective retry). Stated explicitly so a change
 * to the project's default can't cut a generation off mid-call.
 */
export const maxDuration = 120;

/**
 * F26 — Revise. Cards sized to the minutes you have before the interview,
 * on the posting's topics, thinnest coverage first. A deck already built for a
 * budget is a read; only a new budget is a model call.
 */
export default async function RevisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/");
  const decks = await getDecks(userId, id);
  return <RevisionDeck analysisId={id} decks={decks} />;
}

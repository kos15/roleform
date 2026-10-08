import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getDecks } from "@/lib/db/queries/drill";
import { RevisionDeck } from "./revision-deck";

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

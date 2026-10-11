import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { getNextRound } from "@/lib/db/queries/rounds";
import { KIND_LABEL, countdownPhrase, prepTarget, whenPhrase } from "@/lib/domain/reminders";

/**
 * "Preparing for: System design (HLD) · in 3 days" (F29.1). Sits above a prep
 * surface so the member can see what they are rehearsing for, and links to
 * the surface that fits that kind of round. Renders nothing with no round
 * ahead — the Rounds tab is where one is added, not here.
 */
export async function NextRoundStrip({ clerkUserId, analysisId }: { clerkUserId: string; analysisId: string }) {
  const round = await getNextRound(clerkUserId, analysisId);
  if (!round) return null;

  const now = new Date();
  const target = prepTarget(round.kind);
  const countdown = countdownPhrase(round.scheduledAt, round.timeZone, now);

  return (
    <div className="mb-7 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-lg)] bg-[var(--color-accent-100)] px-5 py-4">
      <CalendarClock className="lucide h-5 w-5 flex-none" aria-hidden />
      <p className="min-w-0 flex-1 text-[15px] leading-normal">
        <span className="font-extrabold">Preparing for: {round.label}</span>
        {round.label !== KIND_LABEL[round.kind] && round.kind !== "other" ? ` (${KIND_LABEL[round.kind]})` : ""}
        {" · "}
        {whenPhrase(round.scheduledAt, round.timeZone, now)}
        {countdown ? <span className="font-bold"> — {countdown}</span> : null}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href={`/analysis/${analysisId}/${target.path}`} className="btn btn-primary btn-sm no-underline">
          {target.label}
        </Link>
        <Link href={`/analysis/${analysisId}/rounds`} className="btn btn-ghost btn-sm no-underline">
          All rounds
        </Link>
      </div>
    </div>
  );
}

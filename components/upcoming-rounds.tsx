import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Card, Tag } from "@/components/ui";
import { getUpcomingRounds } from "@/lib/db/queries/rounds";
import { KIND_LABEL, countdownPhrase, prepTarget, whenPhrase } from "@/lib/domain/reminders";

/**
 * Every interview round still ahead, across all postings (F29.1). Renders
 * nothing when there are none — an empty "upcoming" card would only be noise
 * above the history table.
 */
export async function UpcomingRounds({ clerkUserId }: { clerkUserId: string }) {
  const rounds = await getUpcomingRounds(clerkUserId);
  if (rounds.length === 0) return null;
  const now = new Date();

  return (
    <Card className="mb-[clamp(1.5rem,3vw,2.25rem)] rounded-[26px] p-6">
      <p className="eyebrow mb-3">Upcoming rounds</p>
      <ul className="space-y-3">
        {rounds.map((r) => {
          const countdown = countdownPhrase(r.scheduledAt, r.timeZone, now);
          const role = [r.analysis.title, r.analysis.company].filter(Boolean).join(" · ") || "Untitled posting";
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <CalendarClock className="lucide h-4 w-4 flex-none" aria-hidden />
              <span className="font-extrabold">{r.label}</span>
              {r.label !== KIND_LABEL[r.kind] && r.kind !== "other" ? <Tag tone="outline">{KIND_LABEL[r.kind]}</Tag> : null}
              <span className="text-[var(--color-text-muted)]">{role}</span>
              <span className="text-sm font-bold">{whenPhrase(r.scheduledAt, r.timeZone, now)}</span>
              {countdown ? <Tag tone="accent">{countdown}</Tag> : null}
              <span className="ml-auto flex gap-2">
                <Link href={`/analysis/${r.analysisId}/${prepTarget(r.kind).path}`} className="btn btn-secondary btn-sm no-underline">
                  Prepare
                </Link>
                <Link href={`/analysis/${r.analysisId}/rounds`} className="btn btn-ghost btn-sm no-underline">
                  Details
                </Link>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

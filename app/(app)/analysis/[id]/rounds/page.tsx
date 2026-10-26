import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getAnalysis } from "@/lib/db/queries/analysis";
import { getDevices, getRounds } from "@/lib/db/queries/rounds";
import { countdownPhrase, whenPhrase } from "@/lib/domain/reminders";
import { pushConfigured } from "@/lib/services/push/send";
import { NotificationsPanel } from "@/components/notifications-panel";
import { RoundsClient, type RoundView } from "./rounds-client";
import { requireFeaturePage } from "@/lib/services/features";

export const metadata = { title: "Interview rounds" };

/** Room for the 30-second "test with the app closed" push (app/actions/push.ts). */
export const maxDuration = 60;

/**
 * F29 — the member's own calendar for this posting, and the reminders it sets
 * off. Every round is something they typed; the app only remembers it and
 * taps them on the shoulder. No model call, no cap, no `ai_runs` row.
 */
export default async function RoundsTab({ params }: { params: Promise<{ id: string }> }) {
  // F31: switched off site-wide → a plain 404.
  await requireFeaturePage("rounds");
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/");

  const analysis = await getAnalysis(userId, id);
  if (!analysis) redirect("/history");
  if (analysis.status !== "ready") redirect(`/analysis/${id}`);

  const [rounds, devices] = await Promise.all([getRounds(userId, id), getDevices(userId)]);
  const now = new Date();

  const views: RoundView[] = rounds.map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind,
    scheduledAt: r.scheduledAt.toISOString(),
    timeZone: r.timeZone,
    when: whenPhrase(r.scheduledAt, r.timeZone, now),
    countdown: countdownPhrase(r.scheduledAt, r.timeZone, now),
    past: r.scheduledAt.getTime() <= now.getTime(),
    notes: r.notes,
    status: r.status,
    leads: r.leads,
    reminders: r.reminders.map((m) => ({ lead: m.lead, status: m.status })),
  }));

  return (
    <div data-tour="rounds" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <RoundsClient analysisId={id} company={analysis.company} rounds={views} />
      <aside className="space-y-4">
        <NotificationsPanel
          compact
          devices={devices.map((d) => ({
            id: d.id,
            key: d.key,
            deviceLabel: d.deviceLabel,
            createdAt: d.createdAt.toISOString(),
            lastSentAt: d.lastSentAt?.toISOString() ?? null,
            enabled: d.enabled,
          }))}
        />
        {!pushConfigured() ? null : (
          <p className="text-sm leading-normal text-[var(--color-text-muted)]">
            A reminder shows the round&rsquo;s name and type, the company and the time — never your
            notes. Tapping it opens the prep that fits that round.
          </p>
        )}
      </aside>
    </div>
  );
}

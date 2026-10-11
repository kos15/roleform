"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, CalendarClock, Check, Pencil, Plus, Trash2, Undo2, X } from "lucide-react";
import { Button, Card, EmptyState, ErrorRegion, Field, Input, Tag, Textarea } from "@/components/ui";
import { createRound, deleteRound, setRoundStatus, updateRound } from "@/app/actions/rounds";
import { DEFAULT_LEADS, LEAD_LABEL, REMINDER_LEADS, type ReminderLead } from "@/lib/domain/reminders";

export interface RoundView {
  id: string;
  label: string;
  scheduledAt: string;
  timeZone: string;
  /** "tomorrow at 3:00 PM", in the round's own zone, computed on the server. */
  when: string;
  past: boolean;
  notes: string;
  status: "upcoming" | "done" | "cancelled";
  leads: ReminderLead[];
  reminders: { lead: ReminderLead; status: "pending" | "sent" | "skipped" | "failed" }[];
}

/** `<input type="datetime-local">` speaks local wall-clock time with no zone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tomorrowAtTen(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toLocalInput(d.toISOString());
}

interface Draft {
  label: string;
  local: string;
  notes: string;
  leads: ReminderLead[];
}

export function RoundsClient({
  analysisId,
  company,
  rounds,
}: {
  analysisId: string;
  company: string | null;
  rounds: RoundView[];
}) {
  const [adding, setAdding] = useState(rounds.length === 0);
  const [editing, setEditing] = useState<string | null>(null);

  const ahead = rounds.filter((r) => r.status === "upcoming" && !r.past);
  const behind = rounds.filter((r) => !(r.status === "upcoming" && !r.past)).reverse();
  const nextNumber = rounds.length + 1;

  return (
    <div>
      <div className="mb-6 max-w-[640px]">
        <h2 className="mb-2.5">Your rounds</h2>
        <p className="text-base leading-relaxed text-[var(--color-text-muted)]">
          Got the call for the next round{company ? ` at ${company}` : ""}? Put it here and Roleform will
          remind you before it starts — with this posting&rsquo;s prep one tap away.
        </p>
      </div>

      {adding ? (
        <RoundForm
          analysisId={analysisId}
          initial={{ label: `Round ${nextNumber}`, local: tomorrowAtTen(), notes: "", leads: [...DEFAULT_LEADS] }}
          onDone={() => setAdding(false)}
          onCancel={rounds.length > 0 ? () => setAdding(false) : undefined}
        />
      ) : (
        <Button onClick={() => setAdding(true)}>
          <Plus className="lucide h-4 w-4" aria-hidden /> Add the next round
        </Button>
      )}

      {rounds.length === 0 && !adding ? (
        <div className="mt-6">
          <EmptyState title="No rounds yet">Add one when an interview is booked.</EmptyState>
        </div>
      ) : null}

      {ahead.length > 0 ? (
        <section className="mt-8">
          <p className="eyebrow mb-3">Coming up</p>
          <ul className="space-y-3">
            {ahead.map((round) =>
              editing === round.id ? (
                <li key={round.id}>
                  <RoundForm
                    analysisId={analysisId}
                    roundId={round.id}
                    initial={{ label: round.label, local: toLocalInput(round.scheduledAt), notes: round.notes, leads: round.leads }}
                    onDone={() => setEditing(null)}
                    onCancel={() => setEditing(null)}
                  />
                </li>
              ) : (
                <RoundRow key={round.id} round={round} analysisId={analysisId} onEdit={() => setEditing(round.id)} />
              ),
            )}
          </ul>
        </section>
      ) : null}

      {behind.length > 0 ? (
        <section className="mt-8">
          <p className="eyebrow mb-3">Earlier</p>
          <ul className="space-y-3">
            {behind.map((round) =>
              editing === round.id ? (
                <li key={round.id}>
                  <RoundForm
                    analysisId={analysisId}
                    roundId={round.id}
                    initial={{ label: round.label, local: tomorrowAtTen(), notes: round.notes, leads: round.leads }}
                    onDone={() => setEditing(null)}
                    onCancel={() => setEditing(null)}
                  />
                </li>
              ) : (
                <RoundRow key={round.id} round={round} analysisId={analysisId} onEdit={() => setEditing(round.id)} />
              ),
            )}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function reminderSummary(round: RoundView): string {
  if (round.status !== "upcoming") return "";
  const pending = round.reminders.filter((r) => r.status === "pending").map((r) => LEAD_LABEL[r.lead].toLowerCase());
  const sent = round.reminders.filter((r) => r.status === "sent").length;
  const parts: string[] = [];
  if (pending.length > 0) parts.push(`Reminding you ${pending.join(" and ")}`);
  if (sent > 0) parts.push(`${sent} reminder${sent === 1 ? "" : "s"} sent`);
  if (parts.length === 0 && !round.past) parts.push("No reminders set");
  return parts.join(" · ");
}

function RoundRow({ round, analysisId, onEdit }: { round: RoundView; analysisId: string; onEdit: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const live = round.status === "upcoming" && !round.past;

  const run = (fn: () => Promise<{ ok: boolean; error?: { message: string } }>) =>
    start(async () => {
      setError(null);
      const result = await fn();
      if (!result.ok) setError(result.error?.message ?? "That didn't save.");
      else router.refresh();
    });

  const summary = reminderSummary(round);

  return (
    <li>
      <Card flat={!live} className="rounded-[var(--radius-lg)] p-5">
        <div className="flex flex-wrap items-start gap-3">
          <CalendarClock className="lucide mt-0.5 h-5 w-5 flex-none" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[17px]">{round.label}</h3>
              {round.status === "done" ? <Tag tone="ink">Done</Tag> : null}
              {round.status === "cancelled" ? <Tag tone="muted">Called off</Tag> : null}
            </div>
            <p className="mt-0.5 text-[15px] font-bold">{round.when}</p>
            {summary ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
                {live ? <BellRing className="lucide h-3.5 w-3.5" aria-hidden /> : null}
                {summary}
              </p>
            ) : null}
            {round.notes ? (
              <p className="mt-2 whitespace-pre-line text-sm leading-normal text-[var(--color-text-muted)]">{round.notes}</p>
            ) : null}
          </div>
        </div>

        {error ? <ErrorRegion title="That didn't save">{error}</ErrorRegion> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {live ? (
            <Link href={`/analysis/${analysisId}/prep`} className="btn btn-primary btn-sm no-underline">
              Prepare for it
            </Link>
          ) : null}
          {round.status === "upcoming" ? (
            <>
              <Button size="sm" variant="secondary" disabled={pending} onClick={onEdit}>
                <Pencil className="lucide h-4 w-4" aria-hidden /> {round.past ? "Reschedule" : "Edit"}
              </Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setRoundStatus(round.id, "done"))}>
                <Check className="lucide h-4 w-4" aria-hidden /> Mark done
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setRoundStatus(round.id, "cancelled"))}>
                <X className="lucide h-4 w-4" aria-hidden /> Called off
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setRoundStatus(round.id, "upcoming"))}>
              <Undo2 className="lucide h-4 w-4" aria-hidden /> Reopen
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            aria-label={`Delete ${round.label}`}
            onClick={() => {
              if (window.confirm(`Delete “${round.label}”? Its reminders go with it.`)) run(() => deleteRound(round.id));
            }}
          >
            <Trash2 className="lucide h-4 w-4" aria-hidden />
          </Button>
        </div>
      </Card>
    </li>
  );
}

function RoundForm({
  analysisId,
  roundId,
  initial,
  onDone,
  onCancel,
}: {
  analysisId: string;
  roundId?: string;
  initial: Draft;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (lead: ReminderLead) =>
    setDraft((d) => ({
      ...d,
      leads: d.leads.includes(lead) ? d.leads.filter((l) => l !== lead) : [...d.leads, lead],
    }));

  const save = () =>
    start(async () => {
      setError(null);
      const at = new Date(draft.local);
      if (Number.isNaN(at.getTime())) {
        setError("Pick a date and a time.");
        return;
      }
      if (at.getTime() <= Date.now() && !roundId) {
        setError("That time has already passed — reminders need a round that's still ahead.");
        return;
      }
      const input = {
        label: draft.label,
        scheduledAt: at.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        notes: draft.notes,
        leads: draft.leads,
      };
      const result = roundId ? await updateRound(roundId, input) : await createRound(analysisId, input);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onDone();
      router.refresh();
    });

  return (
    <Card className="rounded-[var(--radius-lg)] p-5">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Round">
            <Input
              value={draft.label}
              maxLength={120}
              required
              placeholder="Round 2 · System design"
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </Field>
          <Field label="When">
            <Input
              type="datetime-local"
              value={draft.local}
              required
              onChange={(e) => setDraft({ ...draft, local: e.target.value })}
            />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-bold">Remind me</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2.5">
            {REMINDER_LEADS.map((lead) => (
              <label key={lead} className="flex cursor-pointer items-center gap-2.5 text-[15px] font-bold">
                <input
                  type="checkbox"
                  checked={draft.leads.includes(lead)}
                  onChange={() => toggle(lead)}
                  className="h-5 w-5 accent-[var(--color-text)]"
                />
                {LEAD_LABEL[lead]}
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Notes (only you see these — never in a notification)">
          <Textarea
            rows={3}
            maxLength={2000}
            value={draft.notes}
            placeholder="Who you're meeting, the link, what they said to prepare"
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </Field>

        {error ? <ErrorRegion title="That didn't save">{error}</ErrorRegion> : null}

        <div className="flex flex-wrap gap-2.5">
          <Button type="submit" busy={pending} disabled={pending}>
            {roundId ? "Save round" : "Add round"}
          </Button>
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, CalendarClock, Check, Pencil, Plus, Trash2, Undo2, X } from "lucide-react";
import { Button, Card, EmptyState, ErrorRegion, Field, Input, Tag, Textarea } from "@/components/ui";
import { createRound, deleteRound, setRoundStatus, updateRound } from "@/app/actions/rounds";
import {
  DEFAULT_LEADS,
  KIND_LABEL,
  LEAD_LABEL,
  REMINDER_LEADS,
  ROUND_KINDS,
  prepTarget,
  type ReminderLead,
  type RoundKind,
} from "@/lib/domain/reminders";
import { Choice } from "../rapid/shared";

export interface RoundView {
  id: string;
  label: string;
  kind: RoundKind;
  scheduledAt: string;
  timeZone: string;
  /** "tomorrow at 3:00 PM", in the round's own zone, computed on the server. */
  when: string;
  /** "in 5 days" · "tomorrow" · "in 3 hours" — "" once it has started. */
  countdown: string;
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

/** A sensible next kind: after L1 comes L2, after L2 comes L3. */
function nextKind(rounds: RoundView[]): RoundKind {
  const kinds = new Set(rounds.map((r) => r.kind));
  if (kinds.has("l2")) return "l3";
  if (kinds.has("l1")) return "l2";
  if (kinds.has("screening")) return "l1";
  return rounds.length === 0 ? "l1" : "other";
}

interface Draft {
  kind: RoundKind;
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

  const editForm = (round: RoundView) => (
    <li key={round.id}>
      <RoundForm
        analysisId={analysisId}
        roundId={round.id}
        initial={{
          kind: round.kind,
          // A name equal to the kind's own is the default, not a choice — keep it
          // empty so changing the kind renames it.
          label: round.label === KIND_LABEL[round.kind] ? "" : round.label,
          local: round.past ? tomorrowAtTen() : toLocalInput(round.scheduledAt),
          notes: round.notes,
          leads: round.leads,
        }}
        onDone={() => setEditing(null)}
        onCancel={() => setEditing(null)}
      />
    </li>
  );

  return (
    <div>
      <div className="mb-6 max-w-[640px]">
        <h2 className="mb-2.5">Your rounds</h2>
        <p className="text-base leading-relaxed text-[var(--color-text-muted)]">
          Add your round{company ? ` at ${company}` : ""} and its date. We&rsquo;ll count down and
          point you at the right prep.
        </p>
      </div>

      {adding ? (
        <RoundForm
          analysisId={analysisId}
          initial={{ kind: nextKind(rounds), label: "", local: tomorrowAtTen(), notes: "", leads: [...DEFAULT_LEADS] }}
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
                editForm(round)
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
                editForm(round)
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
  const pending = round.reminders.filter((r) => r.status === "pending");
  const sent = round.reminders.filter((r) => r.status === "sent").length;
  const parts: string[] = [];
  if (pending.length > 0) {
    parts.push(`${pending.length} reminder${pending.length === 1 ? "" : "s"} to come, next ${LEAD_LABEL[pending[0].lead].toLowerCase()}`);
  }
  if (sent > 0) parts.push(`${sent} sent`);
  if (parts.length === 0 && !round.past) parts.push("No reminders set");
  return parts.join(" · ");
}

function RoundRow({ round, analysisId, onEdit }: { round: RoundView; analysisId: string; onEdit: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const live = round.status === "upcoming" && !round.past;
  const target = prepTarget(round.kind);

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
              {round.label !== KIND_LABEL[round.kind] && round.kind !== "other" ? (
                <Tag tone="outline">{KIND_LABEL[round.kind]}</Tag>
              ) : null}
              {round.status === "done" ? <Tag tone="ink">Done</Tag> : null}
              {round.status === "cancelled" ? <Tag tone="muted">Called off</Tag> : null}
              {live && round.countdown ? <Tag tone="accent">{round.countdown}</Tag> : null}
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
            {round.status === "upcoming" && round.past ? (
              <p className="mt-2 text-sm font-bold">How did it go? Mark it done, or reschedule if it moved.</p>
            ) : null}
          </div>
        </div>

        {error ? <ErrorRegion title="That didn't save">{error}</ErrorRegion> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {live ? (
            <Link href={`/analysis/${analysisId}/${target.path}`} className="btn btn-primary btn-sm no-underline">
              Prepare: {target.label.toLowerCase()}
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
      if (!draft.local || Number.isNaN(at.getTime())) {
        setError("Pick the interview date and time.");
        return;
      }
      if (at.getTime() <= Date.now()) {
        setError("That time has already passed — pick when the round is.");
        return;
      }
      const input = {
        kind: draft.kind,
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
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Choice
          label="Which round are you preparing for?"
          options={ROUND_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          value={draft.kind}
          onChange={(kind) => setDraft({ ...draft, kind })}
          disabled={pending}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Interview date and time">
            <Input
              type="datetime-local"
              value={draft.local}
              required
              onChange={(e) => setDraft({ ...draft, local: e.target.value })}
            />
          </Field>
          <Field label="Name (optional)">
            <Input
              value={draft.label}
              maxLength={120}
              placeholder={KIND_LABEL[draft.kind]}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </Field>
        </div>

        <fieldset>
          <legend className="eyebrow mb-2">Remind me</legend>
          <div className="grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
            {REMINDER_LEADS.map((lead) => (
              <label key={lead} className="flex cursor-pointer items-center gap-2.5 text-[15px] font-bold">
                <input
                  type="checkbox"
                  checked={draft.leads.includes(lead)}
                  onChange={() => toggle(lead)}
                  className="h-5 w-5 flex-none accent-[var(--color-text)]"
                />
                {LEAD_LABEL[lead]}
              </label>
            ))}
          </div>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Reminders whose moment has already passed are skipped. Each one opens{" "}
            {prepTarget(draft.kind).label.toLowerCase()} for this posting.
          </p>
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

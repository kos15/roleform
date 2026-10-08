"use client";

import { useMemo, useState } from "react";
import { Check, Eye, Play, RotateCcw, Sparkles, Square } from "lucide-react";
import { buildRevisionDeck } from "@/app/actions/drill";
import { Button, Skeleton, Tag } from "@/components/ui";
import { InfoNote } from "@/components/info-note";
import { REVISION_BUDGETS, cardsForBudget, type RevisionBudget } from "@/lib/domain/drill";
import { DRILL_ESTIMATES, formatCount } from "@/lib/domain/tokens";
import { Choice, Prose, formatClock, useCountdown, usePaidAction } from "./shared";
import type { CardView, DeckView } from "./types";

type Mark = "known" | "again";

export function RevisionDeck({ analysisId, decks }: { analysisId: string; decks: DeckView[] }) {
  const [built, setBuilt] = useState<Map<number, CardView[]>>(
    () => new Map(decks.map((d) => [d.minutes, d.cards])),
  );
  const [minutes, setMinutes] = useState<RevisionBudget>(
    (decks[0]?.minutes as RevisionBudget | undefined) ?? 20,
  );
  const { pending, run, feedback } = usePaidAction<DeckView>();
  const cards = built.get(minutes) ?? null;

  const build = () =>
    run(
      () => buildRevisionDeck(analysisId, minutes),
      (deck) => setBuilt((prev) => new Map(prev).set(deck.minutes, deck.cards)),
    );

  return (
    <div className="space-y-6">
      <Choice
        label="How long until the interview?"
        value={minutes}
        onChange={setMinutes}
        disabled={pending}
        options={REVISION_BUDGETS.map((m) => ({
          value: m,
          label: `${m} min${built.has(m) ? " ✓" : ""}`,
          hint: `${cardsForBudget(m)} cards`,
        }))}
      />

      {feedback}

      {cards ? (
        <Deck key={minutes} cards={cards} minutes={minutes} />
      ) : pending ? (
        <div className="grid gap-4 sm:grid-cols-2" role="status" aria-label="Writing your cards">
          {Array.from({ length: Math.min(4, cardsForBudget(minutes)) }, (_, i) => (
            <div key={i} className="drill-card">
              <Skeleton className="h-6 w-24 rounded-[var(--radius-pill)]" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="card card-outline max-w-[760px] space-y-4">
          <h3 className="text-lg font-extrabold">
            {cardsForBudget(minutes)} cards for {minutes} minutes
          </h3>
          <p className="text-[var(--color-text-muted)]">
            One card per concept: a recall question on the front, the answer, what to remember and the trap
            interviewers set on the back. Topics come from this posting&apos;s requirements, the ones your
            résumé shows least of first.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={build} busy={pending} disabled={pending}>
              <Sparkles className="lucide h-4 w-4" />
              Build my cards
            </Button>
            <span className="text-xs text-[var(--color-text-muted)]">
              About {formatCount(DRILL_ESTIMATES.revision)} tokens, once. Opening it again is free.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Deck({ cards, minutes }: { cards: CardView[]; minutes: number }) {
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const [onlyAgain, setOnlyAgain] = useState(false);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const left = useCountdown(endsAt);

  const known = Object.values(marks).filter((m) => m === "known").length;
  const shown = useMemo(
    () => cards.map((c, i) => ({ c, i })).filter(({ i }) => !onlyAgain || marks[i] === "again"),
    [cards, marks, onlyAgain],
  );
  const againCount = Object.values(marks).filter((m) => m === "again").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {endsAt === null ? (
          <Button variant="secondary" size="sm" onClick={() => setEndsAt(Date.now() + minutes * 60_000)}>
            <Play className="lucide h-4 w-4" />
            Start a {minutes}-minute session
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="clock text-lg" data-over={left !== null && left < 0 ? "true" : undefined} aria-live="off">
              {formatClock(left ?? 0)}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setEndsAt(null)}>
              <Square className="lucide h-4 w-4" />
              Stop
            </Button>
          </div>
        )}
        {/* N16: a count, never a percentage. */}
        <span className="text-sm font-semibold">
          {known} of {cards.length} known
        </span>
        {againCount > 0 ? (
          <button
            type="button"
            className="text-sm font-semibold underline underline-offset-4"
            onClick={() => setOnlyAgain((v) => !v)}
          >
            {onlyAgain ? "Show all cards" : `Show only the ${againCount} to review again`}
          </button>
        ) : null}
        {Object.keys(marks).length > 0 ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)]"
            onClick={() => {
              setMarks({});
              setOnlyAgain(false);
            }}
          >
            <RotateCcw className="lucide h-3.5 w-3.5" /> Reset
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {shown.map(({ c, i }) => (
          <FlipCard
            key={i}
            card={c}
            index={i}
            total={cards.length}
            mark={marks[i]}
            onMark={(m) => setMarks((prev) => ({ ...prev, [i]: m }))}
          />
        ))}
      </div>

      <InfoNote>
        Cards teach the subject and say nothing about you — your own experience stays on the Prep tab, where
        every line points at the bullet it came from.
      </InfoNote>
    </div>
  );
}

function FlipCard({
  card,
  index,
  total,
  mark,
  onMark,
}: {
  card: CardView;
  index: number;
  total: number;
  mark: Mark | undefined;
  onMark: (m: Mark) => void;
}) {
  const [back, setBack] = useState(false);
  return (
    <article className="drill-card rise-in" data-state={mark} data-face={back ? "back" : "front"} aria-label={card.title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tag tone="pink" className="max-w-full overflow-hidden text-ellipsis">
          {card.topic}
        </Tag>
        <span className="text-xs font-semibold text-[var(--color-text-muted)]">
          {index + 1} / {total}
        </span>
      </div>
      <h3 className="text-lg font-extrabold leading-snug">{card.title}</h3>

      {!back ? (
        <>
          <Prose text={card.recall} className="answer-prose font-semibold" />
          <div className="mt-auto">
            <Button variant="secondary" size="sm" onClick={() => setBack(true)}>
              <Eye className="lucide h-4 w-4" />
              Show answer
            </Button>
          </div>
        </>
      ) : (
        <>
          <Prose text={card.answer} className="answer-prose font-semibold" />
          <ul className="answer-prose list-disc space-y-1 pl-5 text-[var(--color-text-muted)]">
            {card.keyPoints.map((p, i) => (
              <li key={i}>
                <Prose text={p} className="inline" />
              </li>
            ))}
          </ul>
          {card.example ? <pre className="code-block">{card.example}</pre> : null}
          <div className="hook">
            <p className="eyebrow mb-1">The trap</p>
            <Prose text={card.pitfall} className="answer-prose" />
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <Button size="sm" variant={mark === "known" ? "primary" : "secondary"} onClick={() => onMark("known")}>
              <Check className="lucide h-4 w-4" />
              Got it
            </Button>
            <Button size="sm" variant={mark === "again" ? "primary" : "ghost"} onClick={() => onMark("again")}>
              <RotateCcw className="lucide h-4 w-4" />
              Review again
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setBack(false)}>
              Flip back
            </Button>
          </div>
        </>
      )}
    </article>
  );
}

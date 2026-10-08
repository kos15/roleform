"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, History, Play, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { openQuizRound, retakeQuizRound, startQuizRound, submitQuizRound } from "@/app/actions/drill";
import { Button, Card, Skeleton, Tag } from "@/components/ui";
import { DIFFICULTIES, QUIZ_LENGTHS, SECONDS_PER_QUESTION, type Difficulty, type QuizLength } from "@/lib/domain/drill";
import { DRILL_ESTIMATES, formatCount } from "@/lib/domain/tokens";
import { Choice, Prose, usePaidAction } from "../shared";
import type { RoundResultView, RoundSummary, RoundView } from "../types";

const KEYS = ["A", "B", "C", "D"];

type Phase =
  | { kind: "setup" }
  | { kind: "play"; round: RoundView }
  | { kind: "result"; result: RoundResultView };

export function QuizRound({ analysisId, rounds }: { analysisId: string; rounds: RoundSummary[] }) {
  const [phase, setPhase] = useState<Phase>({ kind: "setup" });
  const [history, setHistory] = useState(rounds);
  const [count, setCount] = useState<QuizLength>(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const start = usePaidAction<RoundView>();
  const free = usePaidAction<RoundView | RoundResultView>();

  const begin = () =>
    start.run(
      () => startQuizRound(analysisId, count, difficulty),
      (round) => setPhase({ kind: "play", round }),
    );

  const finished = (result: RoundResultView) => {
    setPhase({ kind: "result", result });
    setHistory((h) => [
      { id: result.id, createdAt: new Date().toISOString(), correct: result.grade.correct, total: result.grade.total },
      ...h.filter((r) => r.id !== result.id),
    ]);
  };

  if (phase.kind === "play") return <Play_ round={phase.round} onDone={finished} />;

  if (phase.kind === "result") {
    return (
      <Results
        result={phase.result}
        busy={free.pending}
        feedback={free.feedback}
        onRetake={() =>
          free.run(
            () => retakeQuizRound(phase.result.id),
            (round) => "secondsPerQuestion" in round && setPhase({ kind: "play", round }),
          )
        }
        onNew={() => setPhase({ kind: "setup" })}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-6">
        <Choice
          label="Questions"
          value={count}
          onChange={setCount}
          disabled={start.pending}
          options={QUIZ_LENGTHS.map((n) => ({ value: n, label: String(n) }))}
        />
        <Choice
          label="Difficulty"
          value={difficulty}
          onChange={setDifficulty}
          disabled={start.pending}
          options={DIFFICULTIES.map((d) => ({
            value: d,
            label: `${d[0].toUpperCase()}${d.slice(1)} · ${SECONDS_PER_QUESTION[d]}s`,
          }))}
        />
      </div>

      {start.feedback}

      {start.pending ? (
        <Card className="max-w-[760px] space-y-3" role="status" aria-label="Writing your round">
          <Skeleton className="h-5 w-2/3" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-[var(--radius-md)]" />
          ))}
        </Card>
      ) : (
        <div className="card card-outline max-w-[760px] space-y-4">
          <h3 className="text-lg font-extrabold">
            {count} questions, {SECONDS_PER_QUESTION[difficulty]} seconds each
          </h3>
          <p className="text-[var(--color-text-muted)]">
            One question at a time against the clock. When it runs out the question counts as unanswered and
            the next one opens. Answers and explanations appear when the round ends.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={begin} disabled={start.pending}>
              <Sparkles className="lucide h-4 w-4" />
              Start the round
            </Button>
            <span className="text-xs text-[var(--color-text-muted)]">
              About {formatCount(DRILL_ESTIMATES.quiz)} tokens. Retaking a round is free.
            </span>
          </div>
        </div>
      )}

      {history.length > 0 ? (
        <div className="max-w-[760px]">
          <p className="eyebrow mb-3 flex items-center gap-2">
            <History className="lucide h-4 w-4" /> Earlier rounds
          </p>
          {free.feedback}
          <ul className="space-y-2">
            {history.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={free.pending}
                  className="quiz-option items-center justify-between"
                  onClick={() =>
                    free.run(
                      () => openQuizRound(r.id),
                      (view) =>
                        "grade" in view ? setPhase({ kind: "result", result: view }) : setPhase({ kind: "play", round: view }),
                    )
                  }
                >
                  <span>{new Date(r.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                  <span className="font-extrabold">
                    {r.correct === null ? "Not finished" : `${r.correct} of ${r.total}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** The round in play. Picks are kept here and sent once, at the end. */
function Play_({ round, onDone }: { round: RoundView; onDone: (result: RoundResultView) => void }) {
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<(number | null)[]>(() => round.questions.map(() => null));
  const [deadline, setDeadline] = useState(() => Date.now() + round.secondsPerQuestion * 1000);
  const [now, setNow] = useState(() => Date.now());
  const submit = usePaidAction<RoundResultView>();
  const sent = useRef(false);

  const q = round.questions[index];
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));

  const advance = useCallback(
    (pick: number | null) => {
      const next = [...picks];
      next[index] = pick;
      setPicks(next);
      if (index + 1 < round.questions.length) {
        setIndex(index + 1);
        setDeadline(Date.now() + round.secondsPerQuestion * 1000);
        setNow(Date.now());
      } else if (!sent.current) {
        sent.current = true;
        submit.run(() => submitQuizRound(round.id, next), onDone);
      }
    },
    [index, picks, round, submit, onDone],
  );

  useEffect(() => {
    if (sent.current) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!sent.current && now >= deadline) advance(null);
  }, [now, deadline, advance]);

  // Keyboard: A–D or 1–4 picks.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sent.current || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toUpperCase();
      const i = KEYS.indexOf(k) >= 0 ? KEYS.indexOf(k) : ["1", "2", "3", "4"].indexOf(k);
      if (i >= 0) advance(i);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance]);

  if (sent.current) {
    return (
      <div className="max-w-[760px] space-y-4">
        {submit.feedback}
        {submit.pending ? (
          <Card role="status" aria-label="Grading">
            <Skeleton className="h-6 w-40" />
          </Card>
        ) : null}
      </div>
    );
  }

  const fraction = left / round.secondsPerQuestion;
  return (
    <div className="max-w-[760px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-bold">
          Question {index + 1} of {round.questions.length}
        </span>
        <div className="flex items-center gap-2">
          <Tag tone="pink">{q.topic}</Tag>
          <Tag tone="muted">{q.difficulty}</Tag>
        </div>
      </div>

      <div>
        <div
          className={`progress ${fraction <= 0.25 ? "progress-urgent" : ""}`}
          role="timer"
          aria-label={`${left} seconds left`}
        >
          <span style={{ width: `${fraction * 100}%` }} />
        </div>
        <p className="clock mt-1.5 text-right text-sm" data-over={left <= 5 ? "true" : undefined}>
          {left}s
        </p>
      </div>

      <Prose text={q.stem} className="q-text whitespace-pre-wrap" />

      <div className="space-y-2.5" role="group" aria-label="Options">
        {q.options.map((o, i) => (
          <button key={i} type="button" className="quiz-option" onClick={() => advance(i)}>
            <span className="quiz-key" aria-hidden>
              {KEYS[i]}
            </span>
            <Prose text={o} className="whitespace-pre-wrap" />
          </button>
        ))}
      </div>

      <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
        <span>Keys A–D or 1–4 answer.</span>
        <button type="button" className="underline underline-offset-4" onClick={() => advance(null)}>
          Skip
        </button>
      </div>
    </div>
  );
}

function Results({
  result,
  busy,
  feedback,
  onRetake,
  onNew,
}: {
  result: RoundResultView;
  busy: boolean;
  feedback: React.ReactNode;
  onRetake: () => void;
  onNew: () => void;
}) {
  const { grade } = result;
  return (
    <div className="space-y-7">
      <div className="card card-pink max-w-[760px]">
        <p className="eyebrow mb-1">Round complete</p>
        <p className="display text-[44px] leading-none">
          {grade.correct} of {grade.total}
        </p>
        <p className="mt-2 text-sm font-semibold">
          {grade.unanswered > 0 ? `${grade.unanswered} ran out of time. ` : ""}A practice count on general
          knowledge — not a prediction of anything.
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {grade.byTopic.map((t) => (
            <li key={t.topic}>
              <Tag tone={t.correct === t.total ? "ink" : t.correct === 0 ? "warn" : "default"}>
                {t.topic} · {t.correct}/{t.total}
              </Tag>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="secondary" size="sm" onClick={onRetake} disabled={busy} busy={busy}>
            <RotateCcw className="lucide h-4 w-4" />
            Retake (free)
          </Button>
          <Button size="sm" onClick={onNew} disabled={busy}>
            <Play className="lucide h-4 w-4" />
            New round
          </Button>
        </div>
      </div>
      {feedback}

      <ol className="max-w-[760px] space-y-4">
        {result.questions.map((q, i) => {
          const right = q.pick === q.answerIndex;
          return (
            <li key={i} className="card space-y-3">
              <div className="flex items-start gap-3">
                {right ? (
                  <CheckCircle2 className="lucide mt-0.5 h-5 w-5 flex-none text-[var(--color-sage-700)]" aria-label="Correct" />
                ) : (
                  <XCircle className="lucide mt-0.5 h-5 w-5 flex-none text-[var(--color-danger-700)]" aria-label={q.pick === null ? "Unanswered" : "Wrong"} />
                )}
                <Prose text={q.stem} className="font-bold leading-snug whitespace-pre-wrap" />
              </div>
              <div className="space-y-2">
                {q.options.map((o, j) => (
                  <div
                    key={j}
                    className="quiz-option"
                    data-result={j === q.answerIndex ? "right" : j === q.pick ? "wrong" : undefined}
                  >
                    <span className="quiz-key" aria-hidden>
                      {KEYS[j]}
                    </span>
                    <Prose text={o} className="whitespace-pre-wrap" />
                    {j === q.pick ? <span className="ml-auto text-xs font-bold">Your pick</span> : null}
                  </div>
                ))}
              </div>
              {q.pick === null ? <p className="text-sm font-semibold">Ran out of time.</p> : null}
              <Prose text={q.explanation} className="answer-prose text-[var(--color-text-muted)]" />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Lightbulb,
  Play,
  Send,
  Shuffle,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  revealHint,
  revealSolution,
  runChallengeTests,
  startChallenge,
  submitChallenge,
} from "@/app/actions/drill";
import { Button, Card, ErrorRegion, Skeleton, Tag } from "@/components/ui";
import {
  CHALLENGE_MINUTES,
  CODE_LANGUAGES,
  DIFFICULTIES,
  LANGUAGE_LABEL,
  RUNNABLE,
  sameValue,
  type CaseResult,
  type CodeLanguage,
  type Difficulty,
} from "@/lib/domain/drill";
import { DRILL_ESTIMATES, formatCount } from "@/lib/domain/tokens";
import { Choice, Prose, formatClock, safely, useCountdown, usePaidAction } from "../shared";
import type { AttemptView, ChallengeSummary, ChallengeView, SolutionView, TestRun } from "../types";

interface BankEntry {
  slug: string;
  title: string;
  difficulty: Difficulty;
  topic: string;
}

type Source = "bank" | "generated";

export function CodeChallenge({
  analysisId,
  summaries,
  initial,
  bank,
}: {
  analysisId: string;
  summaries: ChallengeSummary[];
  initial: ChallengeView | null;
  bank: BankEntry[];
}) {
  const router = useRouter();
  const [challenge, setChallenge] = useState<ChallengeView | null>(initial);
  const [source, setSource] = useState<Source>("bank");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [language, setLanguage] = useState<CodeLanguage>("python");
  const [slug, setSlug] = useState<string | null>(null);
  const start = usePaidAction<ChallengeView>();

  const open = (view: ChallengeView) => {
    setChallenge(view);
    router.replace(`?c=${view.id}`, { scroll: false });
  };

  if (challenge) {
    return (
      <Workspace
        key={challenge.id}
        challenge={challenge}
        onBack={() => {
          setChallenge(null);
          router.replace("?", { scroll: false });
          router.refresh();
        }}
      />
    );
  }

  const pool = bank.filter((p) => p.difficulty === difficulty);

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap gap-6">
        <Choice
          label="Problem"
          value={source}
          onChange={(v) => setSource(v)}
          disabled={start.pending}
          options={[
            { value: "bank", label: "Classic DSA" },
            { value: "generated", label: "From this posting" },
          ]}
        />
        <Choice
          label="Difficulty"
          value={difficulty}
          onChange={(d) => {
            setDifficulty(d);
            setSlug(null);
          }}
          disabled={start.pending}
          options={DIFFICULTIES.map((d) => ({
            value: d,
            label: `${d[0].toUpperCase()}${d.slice(1)} · ${CHALLENGE_MINUTES[d]} min`,
          }))}
        />
        <Choice
          label="Language"
          value={language}
          onChange={setLanguage}
          disabled={start.pending}
          options={CODE_LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABEL[l] }))}
        />
      </div>

      {RUNNABLE[language] === null ? (
        <p className="max-w-[760px] text-sm text-[var(--color-text-muted)]">
          {LANGUAGE_LABEL[language]} isn&apos;t executed here — there is no free runtime we can host for it — so
          your solution is reviewed by reading. Pick JavaScript or Python to run the tests as you go.
        </p>
      ) : null}

      {source === "bank" ? (
        <div className="max-w-[760px]">
          <p className="eyebrow mb-3">Pick one, or let us choose</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className="quiz-option items-center"
              data-result={slug === null ? "right" : undefined}
              onClick={() => setSlug(null)}
            >
              <Shuffle className="lucide h-4 w-4 flex-none" />
              <span>Surprise me</span>
            </button>
            {pool.map((p) => (
              <button
                key={p.slug}
                type="button"
                className="quiz-option items-center"
                data-result={slug === p.slug ? "right" : undefined}
                onClick={() => setSlug(p.slug)}
              >
                <span className="flex-1">{p.title}</span>
                <Tag tone="muted">{p.topic}</Tag>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="max-w-[760px] text-[var(--color-text-muted)]">
          A fresh problem set in this posting&apos;s domain, built on its technical requirements. Its hidden
          tests are run against a reference solution before you see them — any the reference fails are
          dropped, so you are never graded against a wrong answer.
        </p>
      )}

      {start.feedback}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() =>
            start.run(() => startChallenge({ analysisId, source, slug, difficulty, language }), open)
          }
          busy={start.pending}
          disabled={start.pending}
        >
          {source === "bank" ? <Play className="lucide h-4 w-4" /> : <Sparkles className="lucide h-4 w-4" />}
          {start.pending ? "Setting up…" : `Start the ${CHALLENGE_MINUTES[difficulty]}-minute clock`}
        </Button>
        <span className="text-xs text-[var(--color-text-muted)]">
          {source === "bank"
            ? `Free to start. A review costs about ${formatCount(DRILL_ESTIMATES.review)} tokens.`
            : `About ${formatCount(DRILL_ESTIMATES.challenge)} tokens to generate, plus ${formatCount(DRILL_ESTIMATES.review)} per review.`}
        </span>
      </div>

      {summaries.length > 0 ? (
        <div className="max-w-[760px]">
          <p className="eyebrow mb-3">Earlier challenges</p>
          <ul className="space-y-2">
            {summaries.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="quiz-option items-center"
                  onClick={() => router.push(`?c=${s.id}`)}
                >
                  <span className="flex-1">
                    {s.title}
                    <span className="block text-xs font-medium text-[var(--color-text-muted)]">
                      {LANGUAGE_LABEL[s.language]} · {s.difficulty} ·{" "}
                      {new Date(s.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                    </span>
                  </span>
                  <Tag tone={s.lastVerdict === "Interview-ready answer" ? "ink" : s.lastVerdict ? "warn" : "muted"}>
                    {s.lastVerdict ?? "Not submitted"}
                  </Tag>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- workspace */

function draftKey(id: string) {
  return `rf-code-${id}`;
}

function Workspace({ challenge, onBack }: { challenge: ChallengeView; onBack: () => void }) {
  // The starter renders on the server and on first paint; a saved draft is
  // restored after hydration. Reading localStorage during the first render
  // made the server and client disagree about the editor's contents.
  const [code, setCode] = useState(challenge.starter);
  const [restored, setRestored] = useState(false);
  const [hints, setHints] = useState(challenge.hints);
  const [solution, setSolution] = useState<SolutionView | null>(challenge.solution);
  const [confirmSolution, setConfirmSolution] = useState(false);
  const [run, setRun] = useState<TestRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, startRunning] = useTransition();
  const [attempts, setAttempts] = useState(challenge.attempts);
  const [freeError, setFreeError] = useState<string | null>(null);
  const [freePending, startFree] = useTransition();
  const submit = usePaidAction<AttemptView>();
  const python = usePythonRunner();

  const endsAt = new Date(challenge.startedAt).getTime() + challenge.minutes * 60_000;
  const left = useCountdown(endsAt);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey(challenge.id));
      if (saved) setCode(saved);
    } catch {
      /* a convenience, not storage */
    }
    setRestored(true);
  }, [challenge.id]);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(draftKey(challenge.id), code);
    } catch {
      /* a convenience, not storage */
    }
  }, [challenge.id, code, restored]);

  const runTests = useCallback(() => {
    setRunError(null);
    startRunning(() =>
      safely(async () => {
        if (challenge.runnable === "server") {
          const result = await runChallengeTests(challenge.id, code);
          if (result.ok) setRun(result.value);
          else setRunError(result.error.message);
        } else if (challenge.runnable === "browser" && challenge.browserTests) {
          const result = await python.run(code, challenge.entryName, challenge.browserTests);
          if ("error" in result) setRunError(result.error);
          else setRun(result);
        }
      }, setRunError),
    );
  }, [challenge, code, python]);

  const doSubmit = () => {
    const failing = run?.results.filter((r) => !r.passed) ?? [];
    submit.run(
      async () => {
        // Python: run first so the review has execution facts, not just a reading.
        let browserRun: { passed: number; total: number; failing: CaseResult[] } | null = null;
        if (challenge.runnable === "browser" && challenge.browserTests) {
          const fresh = await python.run(code, challenge.entryName, challenge.browserTests);
          if (!("error" in fresh)) {
            setRun(fresh);
            browserRun = { passed: fresh.passed, total: fresh.total, failing: fresh.results.filter((r) => !r.passed) };
          } else {
            // Python didn't load or the run was stopped: no execution facts,
            // so the review reads the code rather than recording 0 passes it
            // never measured.
            setRunError(fresh.error);
          }
        } else if (run && challenge.runnable !== "server") {
          browserRun = { passed: run.passed, total: run.total, failing };
        }
        return submitChallenge(challenge.id, code, browserRun);
      },
      (attempt) => setAttempts((a) => [attempt, ...a]),
    );
  };

  const latest = attempts[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold">
          <ArrowLeft className="lucide h-4 w-4" /> All challenges
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--color-text-muted)]">{left === null || left >= 0 ? "Time left" : "Over time"}</span>
          <span className="clock text-2xl" data-over={left !== null && left < 0 ? "true" : undefined}>
            {left === null ? "–:––" : formatClock(left)}
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* ---------------------------------------------------- the problem */}
        <div className="space-y-5">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <Tag tone="pink">{challenge.topic}</Tag>
              <Tag tone="muted">{challenge.difficulty}</Tag>
              <Tag tone="outline">{LANGUAGE_LABEL[challenge.language]}</Tag>
              {challenge.source === "generated" ? <Tag tone="muted">From this posting</Tag> : null}
            </div>
            <h3 className="display text-[34px] leading-tight">{challenge.title}</h3>
          </div>
          <Prose text={challenge.statement} className="answer-prose" />

          <div className="space-y-3">
            {challenge.examples.map((ex, i) => (
              <div key={i} className="code-block whitespace-pre-wrap">
                <div>
                  <strong>Input:</strong> {ex.input}
                </div>
                <div>
                  <strong>Output:</strong> {ex.output}
                </div>
                {ex.explanation ? <div className="mt-1 opacity-80">{ex.explanation}</div> : null}
              </div>
            ))}
          </div>

          <div>
            <p className="eyebrow mb-2">Constraints</p>
            <ul className="answer-prose list-disc space-y-1 pl-5 text-[var(--color-text-muted)]">
              {challenge.constraints.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>

          {/* Hints, one at a time — each one used is part of the verdict. */}
          <div className="space-y-2">
            {hints.map((h, i) => (
              <div key={i} className="hook rise-in">
                <p className="eyebrow mb-1">Hint {i + 1}</p>
                <Prose text={h} className="answer-prose" />
              </div>
            ))}
            {freeError ? <ErrorRegion title="That didn't work">{freeError}</ErrorRegion> : null}
            <div className="flex flex-wrap gap-2 pt-1">
              {hints.length < challenge.hintsTotal ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={freePending}
                  onClick={() =>
                    startFree(() =>
                      safely(async () => {
                        setFreeError(null);
                        const r = await revealHint(challenge.id);
                        if (r.ok) setHints(r.value);
                        else setFreeError(r.error.message);
                      }, setFreeError),
                    )
                  }
                >
                  <Lightbulb className="lucide h-4 w-4" />
                  Hint {hints.length + 1} of {challenge.hintsTotal}
                </Button>
              ) : null}
              {!solution ? (
                confirmSolution ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">Seeing it now counts against the verdict.</span>
                    <Button
                      size="sm"
                      disabled={freePending}
                      onClick={() =>
                        startFree(() =>
                          safely(async () => {
                            setFreeError(null);
                            const r = await revealSolution(challenge.id);
                            if (r.ok) setSolution(r.value);
                            else setFreeError(r.error.message);
                          }, setFreeError),
                        )
                      }
                    >
                      Show it
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmSolution(false)}>
                      Keep going
                    </Button>
                  </span>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setConfirmSolution(true)}>
                    <Eye className="lucide h-4 w-4" />
                    Full solution
                  </Button>
                )
              ) : null}
            </div>
          </div>

          {solution ? (
            <Card flat className="rise-in space-y-3">
              <p className="eyebrow">The solution</p>
              <Prose text={solution.approach} className="answer-prose" />
              <div className="flex flex-wrap gap-2">
                <Tag tone="ink">Time {solution.optimalTime}</Tag>
                <Tag tone="ink">Space {solution.optimalSpace}</Tag>
              </div>
              <pre className="code-block">{solution.code}</pre>
            </Card>
          ) : null}
        </div>

        {/* ---------------------------------------------------- the editor */}
        <div className="space-y-4">
          <CodeEditor value={code} onChange={setCode} onRun={challenge.runnable ? runTests : undefined} />
          <div className="flex flex-wrap items-center gap-3">
            {challenge.runnable ? (
              <Button variant="secondary" onClick={runTests} disabled={running || submit.pending} busy={running}>
                <Play className="lucide h-4 w-4" />
                {running ? (challenge.runnable === "browser" && !python.loaded ? "Loading Python…" : "Running…") : "Run tests"}
              </Button>
            ) : null}
            <Button onClick={doSubmit} disabled={submit.pending || running} busy={submit.pending}>
              <Send className="lucide h-4 w-4" />
              {submit.pending ? "Reviewing…" : "Submit for review"}
            </Button>
            <button
              type="button"
              className="text-sm text-[var(--color-text-muted)] underline underline-offset-4"
              onClick={() => setCode(challenge.starter)}
            >
              Reset code
            </button>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            {challenge.runnable === "server"
              ? `Runs ${challenge.testCount} hidden tests in a sandbox. Ctrl/⌘ + Enter runs them.`
              : challenge.runnable === "browser"
                ? `Runs ${challenge.testCount} hidden tests in your browser (Python via Pyodide). Ctrl/⌘ + Enter runs them.`
                : "Reviewed by reading — this language isn't executed."}
          </p>

          {runError ? <ErrorRegion title="The tests didn't run">{runError}</ErrorRegion> : null}
          {run ? <TestResults run={run} /> : null}
          {submit.feedback}
          {submit.pending ? (
            <Card role="status" aria-label="Reviewing your code" className="space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </Card>
          ) : null}
          {latest ? <ReviewPanel attempt={latest} minutes={challenge.minutes} /> : null}
          {attempts.length > 1 ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              Earlier: {attempts.slice(1).map((a) => a.verdict.label).join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ editor */

/**
 * A plain textarea that behaves enough like an editor: Tab indents, Enter
 * keeps the line's indentation, Ctrl/⌘+Enter runs the tests. Deliberately not
 * a 2 MB editor bundle for a surface opened a few times before an interview.
 */
function CodeEditor({
  value,
  onChange,
  onRun,
}: {
  value: string;
  onChange: (v: string) => void;
  onRun?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const insert = (text: string, el: HTMLTextAreaElement) => {
    const { selectionStart: s, selectionEnd: e } = el;
    const next = value.slice(0, s) + text + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = s + text.length;
    });
  };

  return (
    <textarea
      ref={ref}
      className="code-editor"
      aria-label="Your solution"
      spellCheck={false}
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      rows={18}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        const el = e.currentTarget;
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          onRun?.();
        } else if (e.key === "Tab" && !e.shiftKey) {
          e.preventDefault();
          insert("    ", el);
        } else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
          const lineStart = value.lastIndexOf("\n", el.selectionStart - 1) + 1;
          const indent = /^[ \t]*/.exec(value.slice(lineStart, el.selectionStart))?.[0] ?? "";
          const extra = /[:{[(]\s*$/.test(value.slice(lineStart, el.selectionStart)) ? "    " : "";
          if (indent || extra) {
            e.preventDefault();
            insert(`\n${indent}${extra}`, el);
          }
        }
      }}
    />
  );
}

/* ------------------------------------------------------------------- tests */

function TestResults({ run }: { run: TestRun }) {
  const allPassed = run.passed === run.total;
  return (
    <Card flat className="rise-in space-y-3">
      <p className="flex items-center gap-2 font-extrabold">
        {allPassed ? (
          <CheckCircle2 className="lucide h-5 w-5 text-[var(--color-sage-700)]" />
        ) : (
          <XCircle className="lucide h-5 w-5 text-[var(--color-danger-700)]" />
        )}
        {run.passed} of {run.total} tests passed
      </p>
      <ul className="space-y-2">
        {run.results
          .filter((r) => !r.passed)
          .slice(0, 3)
          .map((r, i) => (
            <li key={i} className="code-block whitespace-pre-wrap text-xs">
              <div>
                <strong>Input:</strong> {r.input}
              </div>
              <div>
                <strong>Expected:</strong> {r.expected}
              </div>
              <div>
                <strong>Got:</strong> {r.actual}
              </div>
            </li>
          ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ review */

const VERDICT_WORD = { optimal: "Optimal", acceptable: "Acceptable", suboptimal: "Suboptimal" } as const;
const CORRECT_WORD = {
  correct: "Correct",
  likely_correct: "Likely correct",
  partially_correct: "Partly correct",
  incorrect: "Incorrect",
} as const;

function ReviewPanel({ attempt, minutes }: { attempt: AttemptView; minutes: number }) {
  const r = attempt.review;
  const tone =
    attempt.verdict.label === "Interview-ready answer" ? "card-pink" : attempt.verdict.label === "Solid, with gaps" ? "card-accent" : "";
  return (
    <div className="rise-in space-y-4">
      <div className={`card ${tone}`}>
        <p className="eyebrow mb-1">Your review</p>
        <p className="display text-[32px] leading-tight">{attempt.verdict.label}</p>
        <ul className="mt-3 space-y-1 text-sm font-semibold">
          {attempt.verdict.reasons.map((reason, i) => (
            <li key={i}>· {reason}</li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Time complexity" value={r.timeComplexity} note={`${VERDICT_WORD[r.timeVerdict]} · best ${attempt.optimalTime}`} />
        <Metric label="Space complexity" value={r.spaceComplexity} note={`${VERDICT_WORD[r.spaceVerdict]} · best ${attempt.optimalSpace}`} />
        <Metric
          plain
          label="Correctness"
          value={CORRECT_WORD[r.correctness]}
          note={attempt.tests ? `${attempt.tests.passed} of ${attempt.tests.total} tests` : "By reading"}
        />
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        Took {formatClock(attempt.secondsUsed)} of {minutes}:00.
      </p>

      <Card flat className="space-y-4">
        <Prose text={r.analysis} className="answer-prose" />
        {r.edgeCases.length ? <ReviewList title="Edge cases it misses" items={r.edgeCases} /> : null}
        {r.strengths.length ? <ReviewList title="What works" items={r.strengths} /> : null}
        <ReviewList title="Make it better" items={r.improvements} />
      </Card>
    </div>
  );
}

function Metric({ label, value, note, plain }: { label: string; value: string; note: string; plain?: boolean }) {
  return (
    <Card flat className="space-y-1">
      <p className="eyebrow">{label}</p>
      <p className={`${plain ? "" : "font-mono "}text-lg font-extrabold`}>{value}</p>
      <p className="text-xs text-[var(--color-text-muted)]">{note}</p>
    </Card>
  );
}

function ReviewList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="eyebrow mb-1.5">{title}</p>
      <ul className="answer-prose list-disc space-y-1 pl-5">
        {items.map((item, i) => (
          <li key={i}>
            <Prose text={item} className="inline" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ python */

type PyResult = TestRun | { error: string };

/**
 * Python in a Web Worker (public/workers/py-runner.js, Pyodide). The worker is
 * created on first use and kept warm; a run that outlives its deadline — an
 * infinite loop — terminates it, and the next run starts a fresh one.
 */
function usePythonRunner() {
  const worker = useRef<Worker | null>(null);
  const [loaded, setLoaded] = useState(false);
  const seq = useRef(0);

  useEffect(() => () => worker.current?.terminate(), []);

  const run = useCallback(
    (code: string, entry: string, cases: { args: unknown[]; expected: unknown }[]): Promise<PyResult> => {
      if (typeof Worker === "undefined") {
        return Promise.resolve({ error: "This browser can't run Python here. Submit for review and it will be read instead." });
      }
      const first = !worker.current;
      let w: Worker;
      try {
        worker.current ??= new Worker("/workers/py-runner.js");
        w = worker.current;
      } catch {
        worker.current = null;
        return Promise.resolve({ error: "Python couldn't start in this browser. Submit for review and it will be read instead." });
      }
      const id = ++seq.current;
      // First run downloads the interpreter; later runs only execute.
      const budget = first || !loaded ? 60_000 : 10_000;

      return new Promise<PyResult>((resolve) => {
        const timer = setTimeout(() => {
          w.terminate();
          worker.current = null;
          setLoaded(false);
          resolve({ error: `Stopped after ${budget / 1000}s — check for an infinite loop.` });
        }, budget);

        w.onmessage = (event: MessageEvent) => {
          const data = event.data as
            | { id: number; ok: true; results: { ok: boolean; value: string }[] }
            | { id: number; ok: false; error: string };
          if (data.id !== id) return;
          clearTimeout(timer);
          setLoaded(true);
          if (!data.ok) {
            resolve({ error: data.error });
            return;
          }
          const results: CaseResult[] = data.results.map((r, i) => {
            let actual: unknown = null;
            try {
              actual = r.ok ? JSON.parse(r.value) : null;
            } catch {
              actual = null;
            }
            return {
              passed: r.ok && sameValue(actual, cases[i].expected),
              input: JSON.stringify(cases[i].args).slice(0, 200),
              expected: JSON.stringify(cases[i].expected).slice(0, 200),
              actual: r.value.slice(0, 200),
            };
          });
          resolve({ results, passed: results.filter((r) => r.passed).length, total: results.length });
        };
        w.onerror = (event) => {
          event.preventDefault();
          clearTimeout(timer);
          // A worker that failed to load its interpreter is dead; the next
          // run starts a fresh one rather than posting into the void.
          w.terminate();
          worker.current = null;
          setLoaded(false);
          resolve({ error: "Python couldn't load. Check your connection and try again." });
        };
        w.postMessage({ id, code, entry, cases: cases.map((c) => c.args) });
      });
    },
    [loaded],
  );

  return { run, loaded };
}

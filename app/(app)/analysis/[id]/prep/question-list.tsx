"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown, CircleCheck } from "lucide-react";
import { Card, Tag } from "@/components/ui";
import { AnswerPanel } from "./answer-panel";
import type { QuestionType, QuestionView } from "./types";

/**
 * The Prep list (F7).
 *
 * Tabs are per family rather than one flat list: "technical" and
 * "system_design" are what a candidate actually rehearses in a block, and
 * hunting them out of twelve mixed questions was the real friction. Both are
 * always offered even at zero — a posting that asks for no system design should
 * say so plainly, not quietly hide the surface.
 */

interface Tab {
  key: string;
  label: string;
  match: (q: QuestionView) => boolean;
  /** Shown even when empty, because its absence would itself be information. */
  always?: boolean;
  empty: string;
}

const TABS: Tab[] = [
  {
    key: "all",
    label: "All",
    match: () => true,
    always: true,
    empty: "No questions match that filter.",
  },
  {
    key: "likely",
    label: "Most likely",
    match: (q) => q.likely,
    always: true,
    empty: "Nothing is flagged as highly likely for this posting.",
  },
  {
    key: "technical",
    label: "Technical",
    match: (q) => q.type === "technical",
    always: true,
    empty:
      "This posting doesn't lean on a specific tool or practice deeply enough to produce a technical round. We'd rather show you that than pad the tab.",
  },
  {
    key: "system_design",
    label: "System design",
    match: (q) => q.type === "system_design",
    always: true,
    empty:
      "Nothing in this posting involves designing or operating a system, so there's no design round to prepare for.",
  },
  {
    key: "behavioral",
    label: "Behavioural",
    match: (q) => q.type === "behavioral",
    empty: "No behavioural questions for this posting.",
  },
  {
    key: "situational",
    label: "Situational",
    match: (q) => q.type === "situational",
    empty: "No situational questions for this posting.",
  },
  {
    key: "culture",
    label: "Culture",
    match: (q) => q.type === "culture",
    empty: "No culture questions for this posting.",
  },
  {
    key: "gap",
    label: "Gaps",
    match: (q) => q.type === "gap",
    empty: "Nothing here probes something your profile can't evidence.",
  },
];

export function QuestionList({
  questions,
  answeredIds,
}: {
  questions: QuestionView[];
  answeredIds: string[];
}) {
  const [tabKey, setTabKey] = useState("all");
  const [open, setOpen] = useState<string[]>([]);
  // Seeded from the server, then extended in place — drafting an answer should
  // flip its badge immediately rather than waiting for a navigation.
  const [answered, setAnswered] = useState(() => new Set(answeredIds));

  // Arriving from the Learning tab's "the question it answers" (#q-<id>).
  //
  // The anchor alone only ever scrolled to a collapsed card — and if the reader
  // had left a family tab selected, to nothing at all. The loop is only worth
  // binding if the user can walk it, so landing on the link opens the question
  // it points at, on the tab that can show it.
  useEffect(() => {
    const id = window.location.hash.replace(/^#q-/, "");
    if (!id || id === window.location.hash) return;
    if (!questions.some((q) => q.id === id)) return;

    setTabKey("all");
    setOpen((prev) => (prev.includes(id) ? prev : [...prev, id]));
    // After the state above has painted the open panel, so the scroll lands on
    // the answer rather than on the header it used to sit under.
    requestAnimationFrame(() => {
      document.getElementById(`q-${id}`)?.scrollIntoView({ block: "center" });
    });
  }, [questions]);

  const markAnswered = useCallback((id: string) => {
    setAnswered((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const counts = useMemo(
    () => new Map(TABS.map((t) => [t.key, questions.filter(t.match).length])),
    [questions],
  );

  const visibleTabs = TABS.filter((t) => t.always || (counts.get(t.key) ?? 0) > 0);
  const tab = visibleTabs.find((t) => t.key === tabKey) ?? visibleTabs[0];
  const shown = questions.filter(tab.match);

  return (
    <section>
      <div className="mb-5">
        <h2>{questions.length} questions this posting suggests</h2>
        <p className="mt-1 max-w-[62ch] text-[var(--color-text-muted)]">
          Each framework is scaffolding for your own answer, not a script — and never a claim you
          can&rsquo;t make. Open one and ask for the full answer when you want to rehearse it.
        </p>
      </div>

      <div className="seg seg-wrap mb-6" role="tablist" aria-label="Question families">
        {visibleTabs.map((t) => {
          const selected = t.key === tab.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTabKey(t.key)}
            >
              {t.label}
              <span className="seg-count">{counts.get(t.key) ?? 0}</span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <Card flat>
          <p className="max-w-[62ch] text-[var(--color-text-muted)]">{tab.empty}</p>
        </Card>
      ) : (
        <Accordion.Root type="multiple" value={open} onValueChange={setOpen} className="space-y-3">
          {shown.map((q, i) => {
            const isOpen = open.includes(q.id);
            return (
              <Accordion.Item key={q.id} value={q.id} asChild>
                <Card
                  // Anchor target for the Learning tab's "the question it
                  // answers" link (RLE spec §1). The proof-of-learning loop is
                  // only worth binding if the user can actually walk it.
                  id={`q-${q.id}`}
                  className={
                    isOpen ? "border-[var(--color-accent-200)] shadow-[var(--shadow-md)]" : undefined
                  }
                >
                  <Accordion.Header>
                    <Accordion.Trigger className="group flex w-full items-start gap-4 text-left">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--color-bg-sunken)] text-xs font-semibold tabular-nums text-[var(--color-text-muted)] group-data-[state=open]:bg-[var(--color-accent-100)] group-data-[state=open]:text-[var(--color-accent-800)]">
                        {i + 1}
                      </span>

                      <span className="flex-1">
                        <span className="q-text block">{q.text}</span>
                        <span className="mt-2.5 flex flex-wrap items-center gap-2">
                          <Tag tone={q.type === "gap" ? "warn" : "muted"}>{LABEL[q.type]}</Tag>
                          {q.likely ? <Tag tone="accent">Most likely</Tag> : null}
                          {answered.has(q.id) ? (
                            <Tag tone="sage">
                              <CircleCheck className="lucide h-3 w-3" />
                              Answer ready
                            </Tag>
                          ) : null}
                        </span>
                      </span>

                      <ChevronDown className="lucide mt-1 h-4 w-4 shrink-0 text-[var(--color-text-muted)] transition-transform group-data-[state=open]:rotate-180" />
                    </Accordion.Trigger>
                  </Accordion.Header>

                  <Accordion.Content className="accordion-content overflow-hidden">
                    <div className="mt-5 space-y-5 pl-11">
                      <div>
                        <p className="eyebrow mb-1.5">Why they ask</p>
                        <p className="answer-prose text-[var(--color-text-muted)]">{q.whyTheyAsk}</p>
                      </div>

                      <div>
                        <p className="eyebrow mb-1.5">Answer framework</p>
                        <ol className="space-y-2">
                          {q.frame.map((point, n) => (
                            <li key={n} className="flex gap-3">
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-accent-300)]" />
                              <span className="answer-prose">{point}</span>
                            </li>
                          ))}
                        </ol>
                      </div>

                      {q.type === "gap" ? (
                        <p className="max-w-[62ch] text-sm text-accent-body">
                          This one probes something your profile can&rsquo;t evidence. The
                          framework above is about positioning honestly — what you lean on
                          instead, and what you&rsquo;re doing about it.
                        </p>
                      ) : (
                        <div>
                          {/* N2: this can never be empty — the CHECK constraint refuses the row. */}
                          <p className="eyebrow mb-1.5">Pull from</p>
                          <ul className="space-y-1.5">
                            {q.evidence.map((text, n) => (
                              <li key={n} className="flex gap-3">
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-sage-400)]" />
                                <span className="answer-prose text-[var(--color-text-muted)]">
                                  {text}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <AnswerPanel
                        questionId={q.id}
                        isOpen={isOpen}
                        hasStored={answered.has(q.id)}
                        isGap={q.type === "gap"}
                        onDrafted={markAnswered}
                      />
                    </div>
                  </Accordion.Content>
                </Card>
              </Accordion.Item>
            );
          })}
        </Accordion.Root>
      )}
    </section>
  );
}

const LABEL: Record<QuestionType, string> = {
  behavioral: "Behavioural",
  technical: "Technical",
  situational: "Situational",
  gap: "Gap",
  culture: "Culture",
  system_design: "System design",
};

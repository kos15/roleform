"use client";

import { useState } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { Card, Tag } from "@/components/ui";

type QuestionType = "behavioral" | "technical" | "situational" | "gap" | "culture";

interface Question {
  id: string;
  type: QuestionType;
  text: string;
  likely: boolean;
  whyTheyAsk: string;
  frame: string[];
  evidence: string[];
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "likely", label: "Highly likely" },
  { key: "behavioral", label: "Behavioural" },
  { key: "gap", label: "Gaps" },
] as const;

export function QuestionList({ questions }: { questions: Question[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  const shown = questions.filter((q) =>
    filter === "all" ? true : filter === "likely" ? q.likely : q.type === filter,
  );

  return (
    <section>
      <div className="mb-5">
        <h2>Ten questions this posting suggests</h2>
        <p className="mt-1 text-[var(--color-text-muted)]">
          Each framework is scaffolding for your own answer, not a script — and never a claim
          you can&rsquo;t make.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className="rounded-[var(--radius-pill)]"
          >
            <Tag tone={filter === f.key ? "accent" : "default"}>{f.label}</Tag>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card flat>
          <p className="text-[var(--color-text-muted)]">No questions match that filter.</p>
        </Card>
      ) : (
        <Accordion.Root type="multiple" className="space-y-3">
          {shown.map((q) => (
            <Accordion.Item key={q.id} value={q.id} asChild>
              <Card>
                <Accordion.Header>
                  <Accordion.Trigger className="group flex w-full items-start gap-3 text-left">
                    <ChevronDown className="lucide mt-1 h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                    <span className="flex-1">
                      <span className="block font-semibold">{q.text}</span>
                      <span className="mt-2 flex flex-wrap gap-2">
                        <Tag tone="muted">{LABEL[q.type]}</Tag>
                        {q.likely ? <Tag tone="accent">Highly likely</Tag> : null}
                      </span>
                    </span>
                  </Accordion.Trigger>
                </Accordion.Header>

                <Accordion.Content className="overflow-hidden pt-4">
                  <div className="space-y-4 pl-7 text-sm">
                    <div>
                      <p className="mb-1 font-semibold">Why they ask</p>
                      <p className="text-[var(--color-text-muted)]">{q.whyTheyAsk}</p>
                    </div>

                    <div>
                      <p className="mb-1 font-semibold">Answer framework</p>
                      <ol className="list-decimal space-y-1 pl-4 text-[var(--color-text-muted)]">
                        {q.frame.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ol>
                    </div>

                    {q.type === "gap" ? (
                      <p className="text-accent-body">
                        This one probes something your profile can&rsquo;t evidence. The
                        framework above is about positioning honestly — what you lean on
                        instead, and what you&rsquo;re doing about it.
                      </p>
                    ) : (
                      <div>
                        {/* N2: this can never be empty — the CHECK constraint refuses the row. */}
                        <p className="mb-1 font-semibold">Pull from:</p>
                        <ul className="list-disc space-y-1 pl-4 text-[var(--color-text-muted)]">
                          {q.evidence.map((text, i) => (
                            <li key={i}>{text}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </Accordion.Content>
              </Card>
            </Accordion.Item>
          ))}
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
};

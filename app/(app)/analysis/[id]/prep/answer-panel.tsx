"use client";

import { useEffect, useState, useTransition } from "react";
import { BookOpen, CornerDownRight, ExternalLink, Sparkles } from "lucide-react";
import { draftAnswer } from "@/app/actions/prep";
import { Button, ErrorRegion, Skeleton, Tag } from "@/components/ui";
import { TokenWallDialog } from "@/components/token-wall";
import { CapWallDialog } from "@/components/cap-wall";
import type { TokenWall } from "@/lib/domain/tokens";
import type { CapWall } from "@/lib/domain/quotas";
import type { AnswerView } from "./types";

/**
 * The worked answer (F7.2).
 *
 * Two blocks, kept visibly apart because they obey different rules:
 *
 *   "How to answer it" — general knowledge about the subject. Nothing here is
 *   a claim about the user, so there is nothing here to fabricate.
 *   "In your own words" — the only first-person material, and every line of it
 *   is printed above the profile bullet it came from. The provenance is on
 *   screen rather than promised (CLAUDE.md §3).
 *
 * Drafted on demand and cached server-side, so `hasStored` means this open
 * costs nothing and can load itself.
 */
export function AnswerPanel({
  questionId,
  isOpen,
  hasStored,
  isGap,
  onDrafted,
}: {
  questionId: string;
  isOpen: boolean;
  hasStored: boolean;
  isGap: boolean;
  /** Lets the list mark this question answered without a round trip to the server. */
  onDrafted: (questionId: string) => void;
}) {
  const [answer, setAnswer] = useState<AnswerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wall, setWall] = useState<TokenWall | null>(null);
  const [capWall, setCapWall] = useState<CapWall | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => {
    setError(null);
    startTransition(async () => {
      const result = await draftAnswer(questionId);
      if (result.ok) {
        setAnswer(result.value);
        onDrafted(questionId);
      } else if (result.error.code === "token_wall" && result.error.wall) {
        // The meter, not a failure. The framework and the source bullets above
        // this panel stay exactly where they are — a drafted answer is the only
        // part of the Prep tab that costs anything (F19).
        setWall(result.error.wall);
      } else if (result.error.capWall) {
        // The answers cap, same shape (F15/F23 PAY-4/PAY-5).
        setCapWall(result.error.capWall);
      } else {
        setError(result.error.message);
      }
    });
  };

  // An already-drafted answer is a database read, not a model call — opening the
  // question is enough of an intent signal to fetch it.
  useEffect(() => {
    if (isOpen && hasStored && !answer && !pending && !error) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, hasStored]);

  if (!answer) {
    return (
      <div className="border-t border-[var(--color-line)] pt-4">
        {wall ? (
          <TokenWallDialog
            wall={wall}
            onClose={() => setWall(null)}
            onResume={() => {
              setWall(null);
              load();
            }}
            resumeLabel="Draft the answer"
          />
        ) : null}
        {capWall ? <CapWallDialog wall={capWall} onClose={() => setCapWall(null)} /> : null}
        {error ? <ErrorRegion title="That draft didn't come back">{error}</ErrorRegion> : null}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" onClick={load} disabled={pending} busy={pending}>
            <Sparkles className="lucide h-4 w-4" />
            {pending ? "Drafting…" : error ? "Try again" : "Write a full answer"}
          </Button>
          {!pending && !error ? (
            <span className="text-xs text-[var(--color-text-muted)]">
              A complete answer, built from the bullets above.
            </span>
          ) : null}
        </div>

        {/* A model call is seconds, not milliseconds. The wait gets the shape of
            what's coming rather than a spinner that says nothing about it. */}
        {pending ? (
          <div className="mt-4 space-y-4" role="status" aria-label="Drafting the answer">
            <Skeleton className="h-5 w-4/5" />
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rise-in space-y-5 border-t border-[var(--color-line)] pt-5">
      <p className="answer-prose font-medium">{answer.headline}</p>

      <div>
        <p className="eyebrow mb-2">How to answer it</p>
        <div className="space-y-4">
          {answer.sections.map((section, i) => (
            <div key={i}>
              <p className="mb-1 text-sm font-semibold">{section.heading}</p>
              <p className="answer-prose text-[var(--color-text-muted)]">{section.body}</p>
            </div>
          ))}
        </div>
      </div>

      {answer.resumeHooks.length > 0 ? (
        <div>
          <p className="eyebrow mb-2">In your own words</p>
          <div className="space-y-3">
            {answer.resumeHooks.map((hook, i) => (
              <div key={i} className="hook">
                <p className="answer-prose">{hook.useIt}</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  From your résumé: {hook.sourceText}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-accent-body">
          {isGap
            ? "Nothing in your profile evidences this one — so the answer above stays general on purpose. Say what you'd do, not what you've done."
            : "Your profile doesn't have a bullet that speaks to this directly. Answer it on the substance above rather than reaching for an example that isn't there."}
        </p>
      )}

      <div>
        <p className="eyebrow mb-2">They'll likely follow up with</p>
        <ul className="space-y-1.5">
          {answer.followUps.map((followUp, i) => (
            <li key={i} className="flex gap-2 text-sm text-[var(--color-text-muted)]">
              <CornerDownRight className="lucide mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{followUp}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="eyebrow mb-2">Concepts to be solid on</p>
        <div className="flex flex-wrap gap-2">
          {answer.keyConcepts.map((concept) => (
            <Tag key={concept} tone="sage">
              {concept}
            </Tag>
          ))}
        </div>
      </div>

      {/* N8: the catalog, or nothing. A model-named link never reaches this list. */}
      {answer.courses.length > 0 ? (
        <div>
          <p className="eyebrow mb-2">Vetted material on these</p>
          <div className="flex flex-wrap gap-2">
            {answer.courses.map((course) => (
              <a
                key={course.id}
                href={course.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[34px] items-center gap-2 rounded-[var(--radius-pill)] border-[1.5px] border-[var(--color-text)] px-3.5 text-[13px] font-bold no-underline"
              >
                <BookOpen className="lucide h-3.5 w-3.5" />
                {course.title}
                <span className="text-[var(--color-text-muted)]">{course.provider}</span>
                <ExternalLink className="lucide h-3 w-3" />
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-xs text-[var(--color-text-muted)]">
        Drafted for this posting. The substance is general knowledge; anything in your voice is
        tied to a bullet you wrote.
      </p>
    </div>
  );
}

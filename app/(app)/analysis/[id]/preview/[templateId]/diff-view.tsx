"use client";

import { useState } from "react";
import { Card, Tag } from "@/components/ui";
import { diffWords } from "@/lib/domain/diff";
import type { RenderModel } from "@/lib/render/model";

/**
 * The document preview with changes highlighted BY DEFAULT (M4.6).
 *
 * The toggle turns highlighting OFF, not on — the user should never have to
 * hunt for what we altered in their own words.
 */
export function DiffView({
  model,
  pairs,
}: {
  model: RenderModel;
  pairs: Array<{ original: string; rewritten: string; transform: string }>;
}) {
  const [showChanges, setShowChanges] = useState(true);
  const byRewritten = new Map(pairs.map((p) => [p.rewritten, p]));

  return (
    <div>
      <label className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={showChanges}
          onChange={(e) => setShowChanges(e.target.checked)}
        />
        Highlight what changed
      </label>

      {/* The preview surface stays a Roleform surface; the EXPORT is exempt from
          organic (CLAUDE.md §9) and rendered by lib/render, not here. */}
      <Card className="space-y-6">
        <header>
          <h2 className="mb-1">{model.name}</h2>
          {model.headline ? <p className="font-semibold">{model.headline}</p> : null}
          <p className="text-sm text-[var(--color-text-muted)]">{model.contactLine}</p>
        </header>

        {model.summary ? (
          <section>
            <SectionHeading>Summary</SectionHeading>
            <p>{model.summary}</p>
          </section>
        ) : null}

        {model.roles.length > 0 ? (
          <section>
            <SectionHeading>Experience</SectionHeading>
            <div className="space-y-5">
              {model.roles.map((role, i) => (
                <div key={i}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <strong>{role.position}</strong>
                    <span className="text-sm text-[var(--color-text-muted)]">{role.dates}</span>
                  </div>
                  <p className="mb-2 text-sm text-[var(--color-text-muted)]">
                    {[role.employer, role.location].filter(Boolean).join(" · ")}
                  </p>
                  <ul className="space-y-2">
                    {role.bullets.map((bullet, j) => {
                      const pair = byRewritten.get(bullet);
                      const changed = pair && pair.original !== pair.rewritten;
                      return (
                        <li key={j} className="flex gap-2">
                          <span aria-hidden>•</span>
                          <span>
                            {showChanges && changed ? (
                              <>
                                {diffWords(pair!.original, bullet).map((op, k) =>
                                  op.kind === "same" ? (
                                    <span key={k}>{op.text}</span>
                                  ) : op.kind === "added" ? (
                                    <mark
                                      key={k}
                                      style={{
                                        background: "var(--color-sage-200)",
                                        color: "var(--color-sage-900)",
                                      }}
                                    >
                                      {op.text}
                                    </mark>
                                  ) : (
                                    <del
                                      key={k}
                                      style={{ color: "var(--color-text-muted)", opacity: 0.7 }}
                                    >
                                      {op.text}
                                    </del>
                                  ),
                                )}
                                <Tag tone="sage" className="ml-2 align-middle">
                                  {pair!.transform}
                                </Tag>
                              </>
                            ) : (
                              bullet
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {model.projects.length > 0 ? (
          <section>
            <SectionHeading>Projects</SectionHeading>
            <div className="space-y-4">
              {model.projects.map((project, i) => (
                <div key={i}>
                  <strong>{project.name}</strong>
                  {project.description ? (
                    <p className="text-sm text-[var(--color-text-muted)]">{project.description}</p>
                  ) : null}
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {project.bullets.map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {model.education.length > 0 ? (
          <section>
            <SectionHeading>Education</SectionHeading>
            {model.education.map((e, i) => (
              <div key={i} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <strong>{e.institution}</strong>
                  {e.qualification ? ` — ${e.qualification}` : ""}
                </span>
                <span className="text-sm text-[var(--color-text-muted)]">{e.dates}</span>
              </div>
            ))}
          </section>
        ) : null}

        {model.skills.length > 0 ? (
          <section>
            <SectionHeading>Skills</SectionHeading>
            <p>{model.skills.join(" · ")}</p>
          </section>
        ) : null}
      </Card>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 border-b border-[var(--color-line)] pb-1 text-sm font-semibold uppercase tracking-wider">
      {children}
    </h3>
  );
}

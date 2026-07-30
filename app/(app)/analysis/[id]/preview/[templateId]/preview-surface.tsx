"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { diffWords } from "@/lib/domain/diff";
import type { RenderModel } from "@/lib/render/model";
import type { TemplateDef } from "@/lib/render/templates";

/**
 * F6 — the draft, rendered as the document it will be.
 *
 * Two jobs at once, and they pull against each other. It has to look like the
 * export — same layout family, same accent, same typeface — or the preview is
 * lying about what you're about to download. And it has to show what we changed
 * in your own words, which the export deliberately doesn't.
 *
 * The resolution: the paper is the document, and the diff is drawn INSIDE the
 * bullets rather than in a panel beside them. Highlighting is on BY DEFAULT
 * (M4.6) and the toggle turns it OFF — the user should never have to hunt for
 * what we altered.
 *
 * White paper, grey rules and the template's own accent are the document's
 * colours. Export templates are exempt from organic (CLAUDE.md §9), and so is
 * their picture; the chrome around this surface is fully tokenised.
 */
const PAPER = "#ffffff";
const INK = "#201e1d";
const QUIET = "#645c50";
const RULE = "#dcd3c4";

export function PreviewSurface({
  model,
  pairs,
  template,
  actions,
}: {
  model: RenderModel;
  pairs: Array<{ original: string; rewritten: string; transform: string }>;
  template: TemplateDef;
  /** Back link and the download buttons — server-rendered, slotted in here so
   *  the toggle can sit in the same row without lifting them into the client. */
  actions?: React.ReactNode;
}) {
  const [showChanges, setShowChanges] = useState(true);
  const byRewritten = new Map(pairs.map((p) => [p.rewritten, p]));

  const bullet = (text: string, key: number) => (
    <Bullet key={key} text={text} pair={byRewritten.get(text)} showChanges={showChanges} />
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {actions}
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={showChanges}
          onClick={() => setShowChanges((v) => !v)}
        >
          {showChanges ? "Hide what changed" : "Show what changed"}
        </Button>
      </div>

      <div
        className="overflow-hidden rounded-[4px] shadow-[var(--shadow-lg)]"
        style={{ background: PAPER, color: INK, fontFamily: template.fontStack }}
      >
        {template.kind === "classic" ? (
          <Classic model={model} template={template} bullet={bullet} />
        ) : null}
        {template.kind === "sidebar" ? (
          <Sidebar model={model} template={template} bullet={bullet} />
        ) : null}
        {template.kind === "creative" ? (
          <Creative model={model} template={template} bullet={bullet} />
        ) : null}
      </div>
    </div>
  );
}

type BulletRenderer = (text: string, key: number) => React.ReactNode;

interface LayoutProps {
  model: RenderModel;
  template: TemplateDef;
  bullet: BulletRenderer;
}

/**
 * One bullet, with the rewrite drawn over the original.
 *
 * `transform` rides along as a label because "rephrase" and "requantify" are
 * different promises: the first says we changed the words, the second says we
 * moved a number that was already in your bullet (CLAUDE.md §3).
 */
function Bullet({
  text,
  pair,
  showChanges,
}: {
  text: string;
  pair?: { original: string; rewritten: string; transform: string };
  showChanges: boolean;
}) {
  const changed = pair && pair.original !== pair.rewritten;
  if (!showChanges || !changed) return <>{text}</>;

  return (
    <>
      {diffWords(pair.original, text).map((op, k) =>
        op.kind === "same" ? (
          <span key={k}>{op.text}</span>
        ) : op.kind === "added" ? (
          <mark key={k} style={{ background: "#e1eecc", color: "#272e1b" }}>
            {op.text}
          </mark>
        ) : (
          <del key={k} style={{ color: QUIET, opacity: 0.7 }}>
            {op.text}
          </del>
        ),
      )}
      <span
        className="ml-1.5 align-middle text-[10px] uppercase tracking-[0.08em]"
        style={{ color: QUIET }}
      >
        {pair.transform}
      </span>
    </>
  );
}

/* ── classic ──────────────────────────────────────────────────────────────── */

function Classic({ model, template, bullet }: LayoutProps) {
  return (
    <div className="min-h-[38rem] px-7 py-11 sm:px-12">
      <header
        className="pb-3.5 text-center"
        style={{ borderBottom: `2px solid ${template.accent}` }}
      >
        <div className="text-[30px] font-bold tracking-[-0.01em]">{model.name}</div>
        {model.headline ? (
          <div
            className="mt-1.5 text-[12.5px] uppercase tracking-[0.09em]"
            style={{ color: QUIET }}
          >
            {model.headline}
          </div>
        ) : null}
        <div
          className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[11.5px]"
          style={{ color: QUIET }}
        >
          {model.contactParts.map((part) => (
            <span key={part}>{part}</span>
          ))}
        </div>
      </header>

      {model.summary ? (
        <Section title="Summary" ruled={false}>
          <p className="text-[12.5px] leading-[1.65]">{model.summary}</p>
        </Section>
      ) : null}

      {model.roles.length > 0 ? (
        <Section title="Experience">
          <div className="flex flex-col gap-4">
            {model.roles.map((role, i) => (
              <div key={i}>
                <div className="flex flex-wrap items-baseline justify-between gap-2.5">
                  <div className="text-[13.5px] font-bold">
                    {role.position}
                    {role.employer ? `, ${role.employer}` : ""}
                  </div>
                  <div className="whitespace-nowrap text-[11px]" style={{ color: QUIET }}>
                    {role.dates}
                  </div>
                </div>
                <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-[18px]">
                  {role.bullets.map((b, j) => (
                    <li key={j} className="text-[12.5px] leading-[1.58]">
                      {bullet(b, j)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {model.projects.length > 0 ? (
        <Section title="Projects">
          <div className="flex flex-col gap-3">
            {model.projects.map((p, i) => (
              <div key={i}>
                <div className="text-[13.5px] font-bold">{p.name}</div>
                <ul className="mt-1 flex list-disc flex-col gap-1 pl-[18px]">
                  {p.bullets.map((b, j) => (
                    <li key={j} className="text-[12.5px] leading-[1.58]">
                      {bullet(b, j)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {model.skills.length > 0 ? (
        <Section title="Skills">
          <div className="text-[12.5px] leading-[1.7]">{model.skills.join(" · ")}</div>
        </Section>
      ) : null}

      {model.education.length > 0 ? (
        <Section title="Education">
          {model.education.map((e, i) => (
            <div key={i} className="flex flex-wrap justify-between gap-2.5 text-[12.5px]">
              <span>{[e.qualification, e.institution].filter(Boolean).join(", ")}</span>
              <span style={{ color: QUIET }}>{e.dates}</span>
            </div>
          ))}
        </Section>
      ) : null}

      {model.certifications.length > 0 ? (
        <Section title="Certifications">
          <div className="text-[12.5px] leading-[1.7]">{model.certifications.join(" · ")}</div>
        </Section>
      ) : null}
    </div>
  );
}

/** Standard heading, standard name — this is what the ATS rules are checking. */
function Section({
  title,
  children,
  ruled = true,
}: {
  title: string;
  children: React.ReactNode;
  ruled?: boolean;
}) {
  return (
    <section className="mt-5">
      <h4
        className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em]"
        style={
          ruled
            ? { borderBottom: `1px solid ${RULE}`, paddingBottom: 6, marginBottom: 12 }
            : undefined
        }
      >
        {title}
      </h4>
      {children}
    </section>
  );
}

/* ── sidebar ──────────────────────────────────────────────────────────────── */

function Sidebar({ model, template, bullet }: LayoutProps) {
  return (
    // The rail stacks above the body below `sm`, whichever side it takes at
    // width — a 32% column of contact details at 380px is unreadable.
    <div className="flex min-h-[38rem] flex-col sm:flex-row">
      <div
        className={`flex shrink-0 flex-col gap-6 px-6 py-8 text-white sm:w-[32%] ${
          template.rail === "right" ? "sm:order-2" : ""
        }`}
        style={{ background: template.accent }}
      >
        <div>
          <div className="text-[25px] font-bold leading-[1.15]">{model.name}</div>
          {model.headline ? (
            <div className="mt-1.5 text-[12.5px] opacity-85">{model.headline}</div>
          ) : null}
        </div>

        <RailBlock title="Contact">
          {model.contactParts.map((part) => (
            <div key={part}>{part}</div>
          ))}
        </RailBlock>

        {model.skills.length > 0 ? (
          <RailBlock title="Skills">
            {model.skills.slice(0, 12).map((s) => (
              <div key={s}>{s}</div>
            ))}
          </RailBlock>
        ) : null}

        {model.education.length > 0 ? (
          <RailBlock title="Education">
            {model.education.map((e, i) => (
              <div key={i}>
                {[e.qualification, e.institution].filter(Boolean).join(", ")}
                {e.dates ? ` · ${e.dates}` : ""}
              </div>
            ))}
          </RailBlock>
        ) : null}
      </div>

      <div className="flex-1 px-7 py-8">
        {model.summary ? (
          <>
            <RailHeading accent={template.accent}>Summary</RailHeading>
            <p className="mb-6 text-[12.5px] leading-[1.62]">{model.summary}</p>
          </>
        ) : null}

        {model.roles.length > 0 ? (
          <>
            <RailHeading accent={template.accent}>Experience</RailHeading>
            <div className="flex flex-col gap-5">
              {model.roles.map((role, i) => (
                <div key={i}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2.5">
                    <div className="text-[13.5px] font-bold">{role.position}</div>
                    <div className="whitespace-nowrap text-[11px]" style={{ color: QUIET }}>
                      {role.dates}
                    </div>
                  </div>
                  <div className="mb-1.5 text-[12px]" style={{ color: QUIET }}>
                    {[role.employer, role.location].filter(Boolean).join(" · ")}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {role.bullets.map((b, j) => (
                      <div key={j} className="flex gap-2 text-[12.5px] leading-[1.55]">
                        <span style={{ color: template.accent }}>•</span>
                        <span>{bullet(b, j)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function RailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] uppercase tracking-[0.12em] opacity-70">{title}</div>
      <div className="flex flex-col gap-1 text-[11.5px] opacity-90">{children}</div>
    </div>
  );
}

function RailHeading({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] uppercase tracking-[0.12em]" style={{ color: accent }}>
      {children}
    </div>
  );
}

/* ── creative ─────────────────────────────────────────────────────────────── */

function Creative({ model, template, bullet }: LayoutProps) {
  return (
    <div className="min-h-[38rem]">
      <div className="px-7 pb-8 pt-9 text-white sm:px-11" style={{ background: template.accent }}>
        <div className="text-[clamp(30px,4.5vw,40px)] font-bold leading-[1.05] tracking-[-0.02em]">
          {model.name}
        </div>
        {model.headline ? <div className="mt-2 text-sm opacity-90">{model.headline}</div> : null}
        <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] opacity-85">
          {model.contactParts.map((part) => (
            <span key={part}>{part}</span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-6 px-7 pb-11 pt-6 sm:px-11">
        <div className="min-w-[15rem] flex-1">
          {model.summary ? (
            <p className="mb-6 text-[13.5px] font-semibold leading-[1.65]">{model.summary}</p>
          ) : null}

          {model.roles.length > 0 ? (
            <>
              <div
                className="mb-4 inline-block rounded-[3px] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white"
                style={{ background: template.accent }}
              >
                Experience
              </div>
              <div className="flex flex-col gap-5">
                {model.roles.map((role, i) => (
                  <div
                    key={i}
                    className="pl-4"
                    style={{ borderLeft: `2px solid ${template.accent}` }}
                  >
                    <div className="text-sm font-bold">{role.position}</div>
                    <div className="mb-1.5 text-[12px]" style={{ color: QUIET }}>
                      {[role.employer, role.dates].filter(Boolean).join(" · ")}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {role.bullets.map((b, j) => (
                        <div key={j} className="text-[12.5px] leading-[1.58]">
                          {bullet(b, j)}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <div className="flex w-full shrink-0 flex-col gap-5 sm:w-[12.5rem]">
          {model.skills.length > 0 ? (
            <div className="rounded-[14px] p-4" style={{ background: "#f7f4ef" }}>
              <div
                className="mb-2 text-[10px] uppercase tracking-[0.14em]"
                style={{ color: QUIET }}
              >
                Skills
              </div>
              <div className="flex flex-wrap gap-1.5">
                {model.skills.slice(0, 12).map((s) => (
                  <span
                    key={s}
                    className="rounded-[var(--radius-pill)] px-2.5 py-0.5 text-[11px]"
                    style={{ background: PAPER }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {model.education.length > 0 ? (
            <div>
              <div
                className="mb-2 text-[10px] uppercase tracking-[0.14em]"
                style={{ color: QUIET }}
              >
                Education
              </div>
              {model.education.map((e, i) => (
                <div key={i} className="text-[12px] leading-[1.55]">
                  {[e.qualification, e.institution].filter(Boolean).join(", ")}
                  {e.dates ? (
                    <>
                      <br />
                      <span style={{ color: QUIET }}>{e.dates}</span>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

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
/** The tinted card behind the skills list in the creative family. */
const CREATIVE_TINT = "#f7f4ef";

/** `Qualification, Institution` — the order both renderers read them in. */
function educationLine(e: RenderModel["education"][number]): string {
  return [e.qualification, e.institution].filter(Boolean).join(", ");
}

/** The creative family's inline section label. */
function Chip({
  accent,
  className,
  children,
}: {
  accent: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mb-4 inline-block rounded-[3px] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white ${className ?? ""}`}
      style={{ background: accent }}
    >
      {children}
    </div>
  );
}

/** The quiet label above a block in the creative family's right column. */
function AsideLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] uppercase tracking-[0.14em]" style={{ color: QUIET }}>
      {children}
    </div>
  );
}

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
        <Layout model={model} template={template} bullet={bullet} />
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
 * Dispatch on `layout`, exactly as the PDF renderer does.
 *
 * The two must stay in step or the preview lies about the download, which is
 * the one thing this surface may never do. Sharing the switch KEY is how that
 * is kept true — a new layout that forgets a branch here fails to compile,
 * because the union is exhaustive.
 */
function Layout(props: LayoutProps) {
  switch (props.template.layout) {
    case "classic":
      return <Classic {...props} />;
    case "sidebar":
      return <Sidebar {...props} />;
    case "creative":
      return <Creative {...props} />;
    case "banner":
      return <Banner {...props} />;
    case "timeline":
      return <Timeline {...props} />;
    case "modular":
      return <Modular {...props} />;
    case "hanging":
      return <Hanging {...props} />;
    case "meter":
      return <Meter {...props} />;
  }
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
              <span>{educationLine(e)}</span>
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
            {model.skills.map((s) => (
              <div key={s}>{s}</div>
            ))}
          </RailBlock>
        ) : null}

        {model.education.length > 0 ? (
          <RailBlock title="Education">
            {model.education.map((e, i) => (
              <div key={i}>
                {educationLine(e)}
                {e.dates ? ` · ${e.dates}` : ""}
              </div>
            ))}
          </RailBlock>
        ) : null}

        {model.certifications.length > 0 ? (
          <RailBlock title="Certifications">
            {model.certifications.map((c) => (
              <div key={c}>{c}</div>
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
                  <MarkedBullets
                    items={role.bullets}
                    accent={template.accent}
                    bullet={bullet}
                  />
                </div>
              ))}
            </div>
          </>
        ) : null}

        {model.projects.length > 0 ? (
          <>
            <RailHeading accent={template.accent}>Projects</RailHeading>
            <div className="flex flex-col gap-5">
              {model.projects.map((p, i) => (
                <div key={i}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2.5">
                    <div className="text-[13.5px] font-bold">{p.name}</div>
                    <div className="whitespace-nowrap text-[11px]" style={{ color: QUIET }}>
                      {p.dates}
                    </div>
                  </div>
                  <MarkedBullets items={p.bullets} accent={template.accent} bullet={bullet} />
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Bullets carrying a literal mark.
 *
 * The mark is tinted rather than dropped, in both renderers: a coloured bullet
 * character still extracts as a list, an absent one doesn't. The rail and
 * creative families would otherwise lose their list structure to styling.
 */
function MarkedBullets({
  items,
  accent,
  bullet,
}: {
  items: string[];
  accent: string;
  bullet: BulletRenderer;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((b, j) => (
        <div key={j} className="flex gap-2 text-[12.5px] leading-[1.55]">
          <span style={{ color: accent }}>•</span>
          <span>{bullet(b, j)}</span>
        </div>
      ))}
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
              <Chip accent={template.accent}>Experience</Chip>
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
                    <MarkedBullets
                      items={role.bullets}
                      accent={template.accent}
                      bullet={bullet}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {model.projects.length > 0 ? (
            <>
              <Chip accent={template.accent} className="mt-5">
                Projects
              </Chip>
              <div className="flex flex-col gap-5">
                {model.projects.map((p, i) => (
                  <div
                    key={i}
                    className="pl-4"
                    style={{ borderLeft: `2px solid ${template.accent}` }}
                  >
                    <div className="text-sm font-bold">{p.name}</div>
                    {p.dates ? (
                      <div className="mb-1.5 text-[12px]" style={{ color: QUIET }}>
                        {p.dates}
                      </div>
                    ) : null}
                    <MarkedBullets items={p.bullets} accent={template.accent} bullet={bullet} />
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <div className="flex w-full shrink-0 flex-col gap-5 sm:w-[12.5rem]">
          {model.skills.length > 0 ? (
            <div className="rounded-[12px] p-4" style={{ background: CREATIVE_TINT }}>
              <AsideLabel>Skills</AsideLabel>
              <div className="flex flex-wrap gap-1.5">
                {model.skills.map((s) => (
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
              <AsideLabel>Education</AsideLabel>
              {model.education.map((e, i) => (
                <div key={i} className="mb-1.5 text-[12px] leading-[1.55]">
                  {educationLine(e)}
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

          {model.certifications.length > 0 ? (
            <div>
              <AsideLabel>Certifications</AsideLabel>
              {model.certifications.map((c) => (
                <div key={c} className="mb-1 text-[12px] leading-[1.55]">
                  {c}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── added in v2.7 ────────────────────────────────────────────────────────── */

/** Contact as words, repeated wherever a header shows it as decoration. */
function ContactParts({ model, center }: { model: RenderModel; center?: boolean }) {
  return (
    <div
      className={`mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] ${center ? "justify-center" : ""}`}
      style={{ color: QUIET }}
    >
      {model.contactParts.map((part) => (
        <span key={part}>{part}</span>
      ))}
    </div>
  );
}

/** The standard block set, shared by the single-column layouts. */
function StandardBlocks({ model, bullet }: { model: RenderModel; bullet: BulletRenderer }) {
  return (
    <>
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
              <span>{educationLine(e)}</span>
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
    </>
  );
}

/**
 * Keystone — tinted masthead, then one plain column.
 *
 * Rates High despite being the most designed template in the set, because the
 * band is decoration: every fact in it is repeated as body text underneath, so
 * a parser that ignores the band entirely loses nothing.
 */
function Banner({ model, template, bullet }: LayoutProps) {
  const initials = model.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="min-h-[38rem] px-7 py-11 sm:px-12">
      <header
        className="flex items-center gap-4 rounded-[4px] px-5 py-4"
        style={{ background: template.accent }}
      >
        <div
          className="grid h-[42px] w-[42px] flex-none place-items-center rounded-full text-[15px] font-bold text-white"
          style={{ background: "rgba(255,255,255,0.18)" }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-[22px] font-bold leading-tight text-white">{model.name}</div>
          {model.headline ? (
            <div className="text-[12px]" style={{ color: "rgba(255,255,255,0.9)" }}>
              {model.headline}
            </div>
          ) : null}
        </div>
      </header>

      {/* The repeat that keeps the rating honest. */}
      <ContactParts model={model} />
      <div className="mt-2.5" style={{ borderBottom: `2px solid ${template.accent}` }} />

      <StandardBlocks model={model} bullet={bullet} />
    </div>
  );
}

/**
 * Throughline — dates down a left margin against a ruled spine.
 *
 * One violation, and it is the spine: the dates are genuinely their own column,
 * which some parsers detach from the role beside them.
 */
function Timeline({ model, template, bullet }: LayoutProps) {
  const row = (dates: string, children: React.ReactNode, key: number) => (
    <div key={key} className="flex gap-0">
      <div
        className="w-[22%] flex-none pr-3 text-right text-[11px] leading-[1.5]"
        style={{ color: QUIET }}
      >
        {dates}
      </div>
      <div className="min-w-0 flex-1 pl-3" style={{ borderLeft: `1px solid ${template.accent}` }}>
        {children}
      </div>
    </div>
  );

  return (
    <div className="min-h-[38rem] px-7 py-11 sm:px-12">
      <header
        className="pb-3.5 text-center"
        style={{ borderBottom: `2px solid ${template.accent}` }}
      >
        <div className="text-[30px] font-bold tracking-[-0.01em]">{model.name}</div>
        {model.headline ? (
          <div className="mt-1.5 text-[12.5px] uppercase tracking-[0.09em]" style={{ color: QUIET }}>
            {model.headline}
          </div>
        ) : null}
        <ContactParts model={model} center />
      </header>

      {model.summary ? (
        <Section title="Summary" ruled={false}>
          <p className="text-[12.5px] leading-[1.65]">{model.summary}</p>
        </Section>
      ) : null}

      {model.roles.length > 0 ? (
        <Section title="Experience">
          <div className="flex flex-col gap-4">
            {model.roles.map((role, i) =>
              row(
                role.dates,
                <>
                  <div className="text-[13.5px] font-bold">{role.position}</div>
                  <div className="text-[11.5px]" style={{ color: QUIET }}>
                    {[role.employer, role.location].filter(Boolean).join(" · ")}
                  </div>
                  <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-[18px]">
                    {role.bullets.map((b, j) => (
                      <li key={j} className="text-[12.5px] leading-[1.58]">
                        {bullet(b, j)}
                      </li>
                    ))}
                  </ul>
                </>,
                i,
              ),
            )}
          </div>
        </Section>
      ) : null}

      {model.projects.length > 0 ? (
        <Section title="Projects">
          <div className="flex flex-col gap-3">
            {model.projects.map((p, i) =>
              row(
                p.dates ?? "",
                <>
                  <div className="text-[13.5px] font-bold">{p.name}</div>
                  <ul className="mt-1 flex list-disc flex-col gap-1 pl-[18px]">
                    {p.bullets.map((b, j) => (
                      <li key={j} className="text-[12.5px] leading-[1.58]">
                        {bullet(b, j)}
                      </li>
                    ))}
                  </ul>
                </>,
                i,
              ),
            )}
          </div>
        </Section>
      ) : null}

      {model.education.length > 0 ? (
        <Section title="Education">
          <div className="flex flex-col gap-2">
            {model.education.map((e, i) =>
              row(e.dates, <div className="text-[12.5px] font-bold">{educationLine(e)}</div>, i),
            )}
          </div>
        </Section>
      ) : null}

      {model.skills.length > 0 ? (
        <Section title="Skills">
          <div className="text-[12.5px] leading-[1.7]">{model.skills.join(" · ")}</div>
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

/**
 * Blueprint — every section a bordered panel on a grid.
 *
 * Two violations, both structural: the panel grid reads as a table, and the
 * tiled skills panel loses its reading order.
 */
function Modular({ model, template, bullet }: LayoutProps) {
  const label = (text: string) => (
    <div
      className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.14em]"
      style={{ color: template.accent }}
    >
      {text}
    </div>
  );
  const panel = "rounded-[3px] border p-4";

  return (
    <div className="min-h-[38rem] px-7 py-11 sm:px-12">
      <header className={panel} style={{ borderColor: template.accent }}>
        <div className="text-[26px] font-bold tracking-[-0.01em]">{model.name}</div>
        {model.headline ? (
          <div className="text-[12.5px] uppercase tracking-[0.09em]" style={{ color: QUIET }}>
            {model.headline}
          </div>
        ) : null}
        <ContactParts model={model} />
      </header>

      {model.summary ? (
        <div className={`${panel} mt-3`} style={{ borderColor: RULE }}>
          {label("Summary")}
          <p className="text-[12.5px] leading-[1.65]">{model.summary}</p>
        </div>
      ) : null}

      {model.roles.length > 0 ? (
        <div className={`${panel} mt-3`} style={{ borderColor: RULE }}>
          {label("Experience")}
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
        </div>
      ) : null}

      {model.projects.length > 0 ? (
        <div className={`${panel} mt-3`} style={{ borderColor: RULE }}>
          {label("Projects")}
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
        </div>
      ) : null}

      {/* The grid that costs the second violation. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {model.skills.length > 0 ? (
          <div className={panel} style={{ borderColor: RULE }}>
            {label("Skills")}
            <div className="flex flex-wrap gap-1.5">
              {model.skills.map((skill, i) => (
                <span
                  key={i}
                  className="rounded-[2px] border px-2 py-0.5 text-[11.5px]"
                  style={{ borderColor: RULE }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {model.education.length > 0 || model.certifications.length > 0 ? (
          <div className={panel} style={{ borderColor: RULE }}>
            {label(model.education.length > 0 ? "Education" : "Certifications")}
            {model.education.map((e, i) => (
              <div key={i} className="mb-1.5">
                <div className="text-[12.5px] font-bold">{educationLine(e)}</div>
                {e.dates ? (
                  <div className="text-[11px]" style={{ color: QUIET }}>
                    {e.dates}
                  </div>
                ) : null}
              </div>
            ))}
            {model.certifications.length > 0 ? (
              <div className="mt-1.5 text-[12.5px] leading-[1.7]">
                {model.certifications.join(" · ")}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Marque — oversized name, section labels hung in the left margin, no colour.
 *
 * The only template in the set with no hue at all; `accent` is the body ink,
 * deliberately. One violation: the hanging labels make a two-column grid.
 */
function Hanging({ model, bullet }: LayoutProps) {
  const row = (label: string, children: React.ReactNode, key: string) => (
    <div key={key} className="flex gap-0 py-3">
      <div
        className="w-[24%] flex-none pr-3 text-[10px] font-bold uppercase leading-[1.5] tracking-[0.14em]"
        style={{ color: QUIET }}
      >
        {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );

  return (
    <div className="min-h-[38rem] px-7 py-11 sm:px-12">
      <div className="text-[38px] font-bold leading-[1.05] tracking-[-0.025em]">{model.name}</div>
      {model.headline ? (
        <div className="mt-1 text-[12.5px] uppercase tracking-[0.09em]" style={{ color: QUIET }}>
          {model.headline}
        </div>
      ) : null}
      <ContactParts model={model} />
      <div className="mt-3" style={{ borderBottom: `1px solid ${RULE}` }} />

      {model.summary
        ? row("Summary", <p className="text-[12.5px] leading-[1.65]">{model.summary}</p>, "sum")
        : null}

      {model.roles.length > 0
        ? row(
            "Experience",
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
            </div>,
            "exp",
          )
        : null}

      {model.projects.length > 0
        ? row(
            "Projects",
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
            </div>,
            "prj",
          )
        : null}

      {model.skills.length > 0
        ? row(
            "Skills",
            <div className="text-[12.5px] leading-[1.7]">{model.skills.join(" · ")}</div>,
            "skl",
          )
        : null}

      {model.education.length > 0
        ? row(
            "Education",
            <>
              {model.education.map((e, i) => (
                <div key={i} className="flex flex-wrap justify-between gap-2.5 text-[12.5px]">
                  <span className="font-bold">{educationLine(e)}</span>
                  <span style={{ color: QUIET }}>{e.dates}</span>
                </div>
              ))}
            </>,
            "edu",
          )
        : null}

      {model.certifications.length > 0
        ? row(
            "Certifications",
            <div className="text-[12.5px] leading-[1.7]">{model.certifications.join(" · ")}</div>,
            "crt",
          )
        : null}
    </div>
  );
}

/**
 * Beacon — dark masthead and proficiency bars for skills.
 *
 * Three violations. The third is the one worth naming: bar length carries the
 * proficiency, which is information no parser reads. So the level is ALSO
 * written beside every bar — that does not undo the violation, and the badge
 * still reads Low, but a user who ships this should not lose the words too.
 */
function Meter({ model, template, bullet }: LayoutProps) {
  const total = Math.max(1, model.skills.length);

  return (
    <div className="min-h-[38rem]">
      <header className="px-7 py-7 sm:px-12" style={{ background: INK }}>
        <div className="text-[24px] font-bold leading-tight text-white">{model.name}</div>
        {model.headline ? (
          <div className="text-[12.5px]" style={{ color: "rgba(255,255,255,0.86)" }}>
            {model.headline}
          </div>
        ) : null}
        <div className="mt-2 text-[11px]" style={{ color: "rgba(255,255,255,0.72)" }}>
          {model.contactParts.join("  ·  ")}
        </div>
      </header>

      <div className="px-7 pb-11 pt-1 sm:px-12">
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
            <div className="flex flex-col gap-1.5">
              {model.skills.map((skill, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="w-[38%] flex-none text-[11.5px]">{skill}</span>
                  <span
                    className="h-[4px] flex-1 overflow-hidden rounded-full"
                    style={{ background: RULE }}
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.round((1 - (i / total) * 0.55) * 100)}%`,
                        background: template.accent,
                      }}
                    />
                  </span>
                  {/* The words the bar cannot say. */}
                  <span className="w-[52px] flex-none text-right text-[10.5px]" style={{ color: QUIET }}>
                    {i < total / 2 ? "Core" : "Working"}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {model.education.length > 0 ? (
          <Section title="Education">
            {model.education.map((e, i) => (
              <div key={i} className="flex flex-wrap justify-between gap-2.5 text-[12.5px]">
                <span>{educationLine(e)}</span>
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
    </div>
  );
}

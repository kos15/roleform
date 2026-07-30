import "server-only";
import React from "react";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { RenderModel } from "../model";
import { SECTION_HEADINGS } from "../ats-rules";
import { templateById, type TemplateDef } from "../templates";

/**
 * PDF renderer — the human artifact (F9).
 *
 * @react-pdf/renderer over Puppeteer: Chromium is ~100 MB against Vercel's
 * 50 MB function limit, and this renders in under 500ms rather than 2–5s.
 *
 * Accepted constraint: a restricted component set — flexbox yes, CSS Grid no,
 * no pseudo-selectors. These templates are DESIGNED to that constraint, not
 * ported from web CSS. Do not reach for a Grid here; restructure instead.
 *
 * Text is real text throughout, so select-all highlights every character
 * (M6.8). No icons or graphics carry information — where a creative template
 * shows a mark, the same fact is also present as words.
 *
 * ── This file and `preview-surface.tsx` are one design in two renderers ──
 *
 * The on-screen preview promises the user what they are about to download, so
 * the two have to agree on structure: same header shape, same section order,
 * same rail on the same side, same accent doing the same job. They agree on
 * ratios rather than pixels — this renderer works in points on A4 and scales
 * every value off the body size so the density loop below can compress a
 * document without redesigning it.
 *
 * If you change a layout here, change it there. A preview that lies about the
 * download is worse than a plain one.
 */

/**
 * Résumé text is never hyphenated. The default callback would break an email
 * across lines as `kous-tubh.mishra98@gmail.com`, which is not just ugly — it
 * corrupts the one field a recruiter copies out of the document.
 */
Font.registerHyphenationCallback((word) => [word]);

/**
 * The document's own ink. Not organic tokens: a résumé is the user's document
 * going to a stranger, not a Roleform surface (CLAUDE.md §9). These are the same
 * four values `preview-surface.tsx` uses, for the same reason.
 */
const INK = "#201e1d";
const QUIET = "#645c50";
const RULE = "#dcd3c4";
const PAPER = "#ffffff";
/** The tinted card behind the skills list in the creative family. */
const CREATIVE_TINT = "#f7f4ef";

/** Rail width, shared by the renderer and the preview's `sm:w-[32%]`. */
const RAIL_WIDTH = "32%";

/**
 * Density presets, tried in order until the document fits one page.
 *
 * Padding gives way before type does: a résumé that loses its margins is still
 * readable, one set in 7pt is not. `font` is the body size in points and `gap`
 * scales every vertical rhythm value; the floor is the last row, and a document
 * that still overflows there is honestly a two-page résumé (see `renderFitted`).
 */
export interface Density {
  pad: number;
  side: number;
  font: number;
  gap: number;
}

export const DENSITIES: Density[] = [
  { pad: 42, side: 46, font: 9.6, gap: 1 },
  { pad: 34, side: 42, font: 9.4, gap: 0.82 },
  { pad: 28, side: 38, font: 9.1, gap: 0.68 },
  { pad: 24, side: 34, font: 8.8, gap: 0.56 },
];

type Styles = ReturnType<typeof makeStyles>;

/**
 * `lineHeight` here is deliberate, not decoration.
 *
 * react-pdf resolves a unitless `lineHeight` against the font size of the node
 * that DECLARES it, then inherits the result as an absolute value. The page
 * declares 1.45 at body size, so every descendant inherits that same absolute
 * line box — and any text set larger than the body then overlaps the line under
 * it. Anything set larger than the body must carry its own `lineHeight`.
 */
function makeStyles(d: Density, serif = false) {
  const f = d.font / 9.6;
  const g = d.gap;
  // Broadsheet's serif is the template, not a theme. Both faces have to swap
  // together: a Times body under Helvetica headings reads as a bug, which is
  // exactly what it was.
  const BODY = serif ? "Times-Roman" : "Helvetica";
  const BOLD = serif ? "Times-Bold" : "Helvetica-Bold";
  const size = serif ? d.font * 1.06 : d.font;
  const leading = serif ? 1.5 : 1.45;

  return StyleSheet.create({
    page: {
      paddingTop: d.pad,
      paddingBottom: d.pad,
      paddingHorizontal: d.side,
      fontSize: size,
      lineHeight: leading,
      fontFamily: BODY,
      color: INK,
      backgroundColor: PAPER,
    },
    /** Sidebar and creative bleed their colour to the paper edge. */
    pageBleed: {
      paddingTop: 0,
      paddingBottom: 0,
      paddingHorizontal: 0,
      fontSize: size,
      lineHeight: leading,
      fontFamily: BODY,
      color: INK,
      backgroundColor: PAPER,
    },

    /* ── the centred classic header ── */
    centred: { textAlign: "center" },
    nameLarge: {
      fontSize: (serif ? 23 : 21) * f,
      lineHeight: 1.15,
      fontFamily: BOLD,
      letterSpacing: -0.2,
    },
    headlineCaps: {
      fontSize: 9.4 * f,
      lineHeight: 1.3,
      letterSpacing: 1.1,
      textTransform: "uppercase",
      color: QUIET,
      marginTop: 4 * g,
    },
    contactRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      marginTop: 6 * g,
    },
    contactItem: { fontSize: 8.8 * f, lineHeight: 1.3, color: QUIET, marginHorizontal: 6 },
    /** 2pt in the template's accent — the classic family's one graphic move. */
    headerRule: { borderBottomWidth: 2, marginTop: 10 * g },

    /* ── sections ── */
    section: { marginTop: 14 * g },
    sectionTitle: {
      fontSize: 8.6 * f,
      lineHeight: 1.25,
      fontFamily: BOLD,
      textTransform: "uppercase",
      letterSpacing: 1.5,
    },
    sectionRule: { borderBottomWidth: 0.8, borderBottomColor: RULE, marginTop: 5 * g },
    sectionBody: { marginTop: 9 * g },

    /* ── roles, projects, education ── */
    roleHeader: { flexDirection: "row", justifyContent: "space-between" },
    // flex/flexShrink, not just space-between: in a narrow rail a long employer
    // name would otherwise lay out under its own dates.
    roleTitle: {
      fontSize: 10.2 * f,
      lineHeight: 1.25,
      fontFamily: BOLD,
      flex: 1,
      paddingRight: 6,
    },
    roleMeta: { fontSize: 8.8 * f, lineHeight: 1.3, color: QUIET, marginTop: 1 * g },
    roleDates: {
      fontSize: 8.8 * f,
      lineHeight: 1.3,
      color: QUIET,
      flexShrink: 0,
      textAlign: "right",
    },
    roleBullets: { marginTop: 4 * g },
    block: { marginBottom: 11 * g },
    eduItem: { marginBottom: 5 * g },

    bulletRow: { flexDirection: "row", marginBottom: 2.5 * g, paddingRight: 6 },
    bulletMark: { width: 9 },
    bulletText: { flex: 1 },

    /* ── sidebar rail ── */
    columns: { flexDirection: "row" },
    railBg: { position: "absolute", top: 0, bottom: 0, width: RAIL_WIDTH },
    rail: { width: RAIL_WIDTH, paddingVertical: 30, paddingHorizontal: 22 },
    railName: { fontSize: 17 * f, lineHeight: 1.15, fontFamily: BOLD, color: PAPER },
    railHeadline: { fontSize: 8.8 * f, lineHeight: 1.35, color: "rgba(255,255,255,0.85)", marginTop: 3 * g },
    railLabel: {
      fontSize: 7.6 * f,
      lineHeight: 1.25,
      letterSpacing: 1.3,
      textTransform: "uppercase",
      color: "rgba(255,255,255,0.7)",
      marginBottom: 5 * g,
    },
    railText: { fontSize: 8.4 * f, lineHeight: 1.45, color: "rgba(255,255,255,0.92)" },
    railBlock: { marginTop: 18 * g },
    main: { flex: 1, paddingVertical: 30, paddingHorizontal: 26 },
    /** The rail already names the section; the body labels its own in accent. */
    mainLabel: {
      fontSize: 7.6 * f,
      lineHeight: 1.25,
      letterSpacing: 1.3,
      textTransform: "uppercase",
      marginBottom: 7 * g,
    },

    /* ── creative band ── */
    band: { paddingTop: 32, paddingBottom: 26, paddingHorizontal: 38 },
    bandName: {
      fontSize: 25 * f,
      lineHeight: 1.08,
      fontFamily: BOLD,
      letterSpacing: -0.4,
      color: PAPER,
    },
    bandHeadline: { fontSize: 10.5 * f, lineHeight: 1.3, color: "rgba(255,255,255,0.9)", marginTop: 6 * g },
    bandContactRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 9 * g },
    bandContactItem: { fontSize: 8.8 * f, lineHeight: 1.3, color: "rgba(255,255,255,0.85)", marginRight: 12 },
    creativeBody: { flexDirection: "row", paddingTop: 20, paddingBottom: 32, paddingHorizontal: 38 },
    creativeMain: { flex: 1, paddingRight: 18 },
    creativeAside: { width: "30%" },
    lede: { fontSize: 10 * f, lineHeight: 1.55, fontFamily: BOLD, marginBottom: 16 * g },
    /** An inline chip rather than a full-width band — the design's own choice. */
    chip: {
      alignSelf: "flex-start",
      borderRadius: 3,
      paddingVertical: 3,
      paddingHorizontal: 8,
      marginBottom: 12 * g,
    },
    chipText: {
      fontSize: 7.6 * f,
      lineHeight: 1.25,
      letterSpacing: 1.3,
      textTransform: "uppercase",
      color: PAPER,
    },
    /** Roles hang off an accent rule instead of sitting under a heading. */
    creativeRole: { borderLeftWidth: 2, paddingLeft: 11, marginBottom: 13 * g },
    /**
     * The same title, without `flex: 1`.
     *
     * `roleTitle` is sized to share a row with its dates. Here the title and the
     * meta line stack, and a flexed Text in a column container collapses to zero
     * height — the meta line then draws straight over the title.
     */
    creativeRoleTitle: {
      fontSize: 10.2 * f,
      lineHeight: 1.25,
      fontFamily: BOLD,
    },
    tintCard: { backgroundColor: CREATIVE_TINT, borderRadius: 12, padding: 12, marginBottom: 16 * g },
    asideLabel: {
      fontSize: 7.6 * f,
      lineHeight: 1.25,
      letterSpacing: 1.3,
      textTransform: "uppercase",
      color: QUIET,
      marginBottom: 7 * g,
    },
    pillRow: { flexDirection: "row", flexWrap: "wrap" },
    pill: {
      backgroundColor: PAPER,
      borderRadius: 999,
      paddingVertical: 2,
      paddingHorizontal: 7,
      marginRight: 4,
      marginBottom: 4,
    },
    pillText: { fontSize: 8 * f, lineHeight: 1.3 },
    asideText: { fontSize: 8.6 * f, lineHeight: 1.45 },
    asideItem: { marginBottom: 6 * g },
    listItem: { marginBottom: 1.5 * g },
  });
}

/* ── shared pieces ───────────────────────────────────────────────────────── */

function Bullets({ st, items, accent }: { st: Styles; items: string[]; accent?: string }) {
  return (
    <>
      {items.map((text, i) => (
        <View key={i} style={st.bulletRow}>
          {/* A literal bullet character, so extraction keeps the list structure.
              The creative family tints it rather than dropping it — a coloured
              mark still extracts, an absent one loses the list. */}
          <Text style={accent ? [st.bulletMark, { color: accent }] : st.bulletMark}>•</Text>
          <Text style={st.bulletText}>{text}</Text>
        </View>
      ))}
    </>
  );
}

/** The classic family's section heading: black caps over a hairline rule. */
function Section({
  st,
  title,
  ruled = true,
  children,
}: {
  st: Styles;
  title: string;
  ruled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={st.section}>
      <Text style={st.sectionTitle}>{title}</Text>
      {ruled ? <View style={st.sectionRule} /> : null}
      <View style={st.sectionBody}>{children}</View>
    </View>
  );
}

function RoleList({
  st,
  model,
  accent,
  withEmployerInTitle,
}: {
  st: Styles;
  model: RenderModel;
  accent?: string;
  /** Classic runs "Position, Employer" on one line; the rail families don't. */
  withEmployerInTitle?: boolean;
}) {
  return (
    <>
      {model.roles.map((role, i) => (
        <View key={i} style={st.block} wrap={false}>
          <View style={st.roleHeader}>
            <Text style={st.roleTitle}>
              {withEmployerInTitle && role.employer
                ? `${role.position}, ${role.employer}`
                : role.position}
            </Text>
            <Text style={st.roleDates}>{role.dates}</Text>
          </View>
          {withEmployerInTitle ? null : (
            <Text style={st.roleMeta}>
              {[role.employer, role.location].filter(Boolean).join(" · ")}
            </Text>
          )}
          <View style={st.roleBullets}>
            <Bullets st={st} items={role.bullets} accent={accent} />
          </View>
        </View>
      ))}
    </>
  );
}

function ProjectList({ st, model, accent }: { st: Styles; model: RenderModel; accent?: string }) {
  return (
    <>
      {model.projects.map((project, i) => (
        <View key={i} style={st.block} wrap={false}>
          <View style={st.roleHeader}>
            <Text style={st.roleTitle}>{project.name}</Text>
            <Text style={st.roleDates}>{project.dates}</Text>
          </View>
          {project.description ? <Text style={st.roleMeta}>{project.description}</Text> : null}
          <View style={st.roleBullets}>
            <Bullets st={st} items={project.bullets} accent={accent} />
          </View>
        </View>
      ))}
    </>
  );
}

/** `Qualification, Institution` — the order the preview reads them in. */
function educationLine(e: RenderModel["education"][number]): string {
  return [e.qualification, e.institution].filter(Boolean).join(", ");
}

/* ------------------------------------------------------------ classic family */

function ClassicDoc({
  st,
  model,
  template,
}: {
  st: Styles;
  model: RenderModel;
  template: TemplateDef;
}) {
  const accent = template.accent;

  return (
    <Document title={`${model.name} — ${template.name}`} author={model.name}>
      <Page size="A4" style={st.page}>
        <View style={st.centred}>
          {/* The serif family and its leading come from the stylesheet, which was
              built with `serif` — nothing about the layout below differs. */}
          <Text style={st.nameLarge}>{model.name}</Text>
          {model.headline ? <Text style={st.headlineCaps}>{model.headline}</Text> : null}
          {/* Contact as body text, one item per Text node, never graphics (F9). */}
          <View style={st.contactRow}>
            {model.contactParts.map((part) => (
              <Text key={part} style={st.contactItem}>
                {part}
              </Text>
            ))}
          </View>
        </View>
        <View style={[st.headerRule, { borderBottomColor: accent }]} />

        {model.summary ? (
          <Section st={st} title={SECTION_HEADINGS[0]} ruled={false}>
            <Text>{model.summary}</Text>
          </Section>
        ) : null}

        {model.roles.length > 0 ? (
          <Section st={st} title={SECTION_HEADINGS[1]}>
            <RoleList st={st} model={model} withEmployerInTitle />
          </Section>
        ) : null}

        {model.projects.length > 0 ? (
          <Section st={st} title={SECTION_HEADINGS[2]}>
            <ProjectList st={st} model={model} />
          </Section>
        ) : null}

        {model.skills.length > 0 ? (
          <Section st={st} title={SECTION_HEADINGS[4]}>
            <Text>{model.skills.join(" · ")}</Text>
          </Section>
        ) : null}

        {model.education.length > 0 ? (
          <Section st={st} title={SECTION_HEADINGS[3]}>
            {model.education.map((e, i) => (
              <View key={i} style={st.roleHeader}>
                <Text style={st.roleTitle}>{educationLine(e)}</Text>
                <Text style={st.roleDates}>{e.dates}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        {model.certifications.length > 0 ? (
          <Section st={st} title={SECTION_HEADINGS[5]}>
            <Text>{model.certifications.join(" · ")}</Text>
          </Section>
        ) : null}
      </Page>
    </Document>
  );
}

/* ------------------------------------------------------------ sidebar family */

function SidebarDoc({
  st,
  model,
  template,
}: {
  st: Styles;
  model: RenderModel;
  template: TemplateDef;
}) {
  const accent = template.accent;
  const railRight = template.rail === "right";

  const rail = (
    <View style={st.rail}>
      <View>
        <Text style={st.railName}>{model.name}</Text>
        {model.headline ? <Text style={st.railHeadline}>{model.headline}</Text> : null}
      </View>

      <View style={st.railBlock}>
        <Text style={st.railLabel}>Contact</Text>
        {/* Body text, not graphics — the rail is a layout choice, not an icon set. */}
        {model.contactParts.map((part) => (
          <Text key={part} style={st.railText}>
            {part}
          </Text>
        ))}
      </View>

      {model.skills.length > 0 ? (
        <View style={st.railBlock}>
          <Text style={st.railLabel}>{SECTION_HEADINGS[4]}</Text>
          {model.skills.map((s, i) => (
            <Text key={i} style={st.railText}>
              {s}
            </Text>
          ))}
        </View>
      ) : null}

      {model.education.length > 0 ? (
        <View style={st.railBlock}>
          <Text style={st.railLabel}>{SECTION_HEADINGS[3]}</Text>
          {model.education.map((e, i) => (
            <Text key={i} style={st.railText}>
              {educationLine(e)}
              {e.dates ? ` · ${e.dates}` : ""}
            </Text>
          ))}
        </View>
      ) : null}

      {model.certifications.length > 0 ? (
        <View style={st.railBlock}>
          <Text style={st.railLabel}>{SECTION_HEADINGS[5]}</Text>
          {model.certifications.map((c, i) => (
            <Text key={i} style={st.railText}>
              {c}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );

  const main = (
    <View style={st.main}>
      {model.summary ? (
        <>
          <Text style={[st.mainLabel, { color: accent }]}>{SECTION_HEADINGS[0]}</Text>
          <Text style={st.block}>{model.summary}</Text>
        </>
      ) : null}

      {model.roles.length > 0 ? (
        <>
          <Text style={[st.mainLabel, { color: accent }]}>{SECTION_HEADINGS[1]}</Text>
          <RoleList st={st} model={model} accent={accent} />
        </>
      ) : null}

      {model.projects.length > 0 ? (
        <>
          <Text style={[st.mainLabel, { color: accent }]}>{SECTION_HEADINGS[2]}</Text>
          <ProjectList st={st} model={model} accent={accent} />
        </>
      ) : null}
    </View>
  );

  return (
    <Document title={`${model.name} — ${template.name}`} author={model.name}>
      <Page size="A4" style={st.pageBleed}>
        {/* The rail's colour is a full-height absolute layer, `fixed` so it
            repeats if the document runs to a second page. A coloured View in
            normal flow would only be as tall as the text inside it. */}
        <View
          fixed
          style={[
            st.railBg,
            { backgroundColor: accent },
            railRight ? { right: 0 } : { left: 0 },
          ]}
        />
        <View style={st.columns}>
          {railRight ? (
            <>
              {main}
              {rail}
            </>
          ) : (
            <>
              {rail}
              {main}
            </>
          )}
        </View>
      </Page>
    </Document>
  );
}

/* ----------------------------------------------------------- creative family */

function CreativeDoc({
  st,
  model,
  template,
}: {
  st: Styles;
  model: RenderModel;
  template: TemplateDef;
}) {
  const accent = template.accent;

  return (
    <Document title={`${model.name} — ${template.name}`} author={model.name}>
      <Page size="A4" style={st.pageBleed}>
        <View style={[st.band, { backgroundColor: accent }]}>
          <Text style={st.bandName}>{model.name}</Text>
          {model.headline ? <Text style={st.bandHeadline}>{model.headline}</Text> : null}
          {/* Contact repeated as words even where the design implies icons — no
              information is carried by a glyph alone. */}
          <View style={st.bandContactRow}>
            {model.contactParts.map((part) => (
              <Text key={part} style={st.bandContactItem}>
                {part}
              </Text>
            ))}
          </View>
        </View>

        <View style={st.creativeBody}>
          <View style={st.creativeMain}>
            {/* No heading over the summary: in this family it is the lede. */}
            {model.summary ? <Text style={st.lede}>{model.summary}</Text> : null}

            {model.roles.length > 0 ? (
              <>
                <View style={[st.chip, { backgroundColor: accent }]}>
                  <Text style={st.chipText}>{SECTION_HEADINGS[1]}</Text>
                </View>
                {model.roles.map((role, i) => (
                  <View
                    key={i}
                    style={[st.creativeRole, { borderLeftColor: accent }]}
                    wrap={false}
                  >
                    <Text style={st.creativeRoleTitle}>{role.position}</Text>
                    <Text style={st.roleMeta}>
                      {[role.employer, role.dates].filter(Boolean).join(" · ")}
                    </Text>
                    <View style={st.roleBullets}>
                      <Bullets st={st} items={role.bullets} accent={accent} />
                    </View>
                  </View>
                ))}
              </>
            ) : null}

            {model.projects.length > 0 ? (
              <>
                <View style={[st.chip, { backgroundColor: accent }]}>
                  <Text style={st.chipText}>{SECTION_HEADINGS[2]}</Text>
                </View>
                {model.projects.map((project, i) => (
                  <View
                    key={i}
                    style={[st.creativeRole, { borderLeftColor: accent }]}
                    wrap={false}
                  >
                    <Text style={st.creativeRoleTitle}>{project.name}</Text>
                    {project.dates ? <Text style={st.roleMeta}>{project.dates}</Text> : null}
                    <View style={st.roleBullets}>
                      <Bullets st={st} items={project.bullets} accent={accent} />
                    </View>
                  </View>
                ))}
              </>
            ) : null}
          </View>

          <View style={st.creativeAside}>
            {model.skills.length > 0 ? (
              <View style={st.tintCard}>
                <Text style={st.asideLabel}>{SECTION_HEADINGS[4]}</Text>
                <View style={st.pillRow}>
                  {model.skills.map((s, i) => (
                    <View key={i} style={st.pill}>
                      <Text style={st.pillText}>{s}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {model.education.length > 0 ? (
              <View style={st.asideItem}>
                <Text style={st.asideLabel}>{SECTION_HEADINGS[3]}</Text>
                {model.education.map((e, i) => (
                  <View key={i} style={st.asideItem}>
                    <Text style={st.asideText}>{educationLine(e)}</Text>
                    {e.dates ? <Text style={[st.asideText, { color: QUIET }]}>{e.dates}</Text> : null}
                  </View>
                ))}
              </View>
            ) : null}

            {model.certifications.length > 0 ? (
              <View style={st.asideItem}>
                <Text style={st.asideLabel}>{SECTION_HEADINGS[5]}</Text>
                {model.certifications.map((c, i) => (
                  <Text key={i} style={[st.asideText, st.listItem]}>
                    {c}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </Page>
    </Document>
  );
}

export function ResumeDocument({
  model,
  templateId,
  density = DENSITIES[0],
}: {
  model: RenderModel;
  templateId: string;
  density?: Density;
}): React.ReactElement {
  const template = templateById(templateId);
  if (!template) throw new Error(`unknown template: ${templateId}`);
  // Broadsheet is the one template whose typeface is part of its identity, so the
  // stylesheet is built for it rather than patched at the usage site.
  const st = makeStyles(density, template.id === "broadsheet");
  if (template.kind === "classic")
    return <ClassicDoc st={st} model={model} template={template} />;
  if (template.kind === "sidebar") return <SidebarDoc st={st} model={model} template={template} />;
  return <CreativeDoc st={st} model={model} template={template} />;
}

/**
 * Page count read off the rendered document, not guessed from it.
 *
 * The page tree names each page node `/Type /Page`; `/Type /Pages` is the
 * container and must not be counted. If the object stream ever stops matching,
 * the `/Count` on the container is the fallback rather than a silent 1.
 */
export function countPages(buffer: Buffer): number {
  const text = buffer.toString("latin1");
  const pages = text.match(/\/Type\s*\/Page(?![sA-Za-z])/g);
  if (pages && pages.length > 0) return pages.length;
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  return counts.length > 0 ? Math.max(...counts) : 1;
}

/**
 * Renders at the loosest density that still fits one page.
 *
 * A résumé that spills three lines onto a second page reads as a mistake to the
 * person holding it, and the résumés card promises a page count — so the promise
 * is made true here rather than asserted. Each attempt is a full render (~40ms);
 * the loop stops at the first fit, so a document that already fits costs one.
 *
 * If nothing fits by the floor, the last (tightest) render is returned with its
 * real page count. Two pages of legible type beats one page of 7pt.
 */
export async function renderFitted(
  model: RenderModel,
  templateId: string,
): Promise<{ buffer: Buffer; pageCount: number; densityIndex: number }> {
  let last: { buffer: Buffer; pageCount: number; densityIndex: number } | null = null;

  for (let i = 0; i < DENSITIES.length; i++) {
    const buffer = await renderToBuffer(
      <ResumeDocument model={model} templateId={templateId} density={DENSITIES[i]} />,
    );
    last = { buffer, pageCount: countPages(buffer), densityIndex: i };
    if (last.pageCount <= 1) return last;
  }

  return last!;
}

export async function renderPdf(model: RenderModel, templateId: string): Promise<Buffer> {
  return (await renderFitted(model, templateId)).buffer;
}

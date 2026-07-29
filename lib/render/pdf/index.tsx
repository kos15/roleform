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
 */

/**
 * Résumé text is never hyphenated. The default callback would break an email
 * across lines as `kous-tubh.mishra98@gmail.com`, which is not just ugly — it
 * corrupts the one field a recruiter copies out of the document.
 */
Font.registerHyphenationCallback((word) => [word]);

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
 * it. The name is 2× body size, so it must carry its own `lineHeight`.
 */
function makeStyles(d: Density) {
  const f = d.font / 9.6;
  const g = d.gap;

  return StyleSheet.create({
    page: {
      paddingTop: d.pad,
      paddingBottom: d.pad,
      paddingHorizontal: d.side,
      fontSize: d.font,
      lineHeight: 1.45,
      fontFamily: "Helvetica",
      color: "#1a1a1a",
    },
    name: { fontSize: 20 * f, lineHeight: 1.15, fontFamily: "Helvetica-Bold", marginBottom: 2 * g },
    headline: { fontSize: 10.5 * f, lineHeight: 1.3, marginBottom: 4 * g },
    contact: { fontSize: 9 * f, lineHeight: 1.3, marginBottom: 14 * g },
    sectionTitle: {
      fontSize: 10 * f,
      lineHeight: 1.25,
      fontFamily: "Helvetica-Bold",
      textTransform: "uppercase",
      letterSpacing: 1,
      marginTop: 14 * g,
      marginBottom: 6 * g,
    },
    roleHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 * g },
    // flex/flexShrink, not just space-between: in a narrow rail a long employer
    // name would otherwise lay out under its own dates.
    roleTitle: { fontSize: 10.4 * f, lineHeight: 1.25, fontFamily: "Helvetica-Bold", flex: 1, paddingRight: 6 },
    roleMeta: { fontSize: 9 * f, lineHeight: 1.3 },
    roleDates: { fontSize: 9 * f, lineHeight: 1.3, flexShrink: 0, textAlign: "right" },
    bulletRow: { flexDirection: "row", marginBottom: 2.5 * g, paddingRight: 6 },
    bulletMark: { width: 10 },
    bulletText: { flex: 1 },
    block: { marginBottom: 9 * g },
    rule: { borderBottomWidth: 0.8, marginBottom: 6 * g, marginTop: 1 * g },
    columns: { flexDirection: "row" },
    rail: { width: "31%", paddingRight: 14 },
    main: { flex: 1 },
    railRight: { width: "28%", paddingLeft: 14 },
    band: { paddingVertical: 4 * g, paddingHorizontal: 8, marginTop: 14 * g, marginBottom: 6 * g },
    bandText: {
      fontSize: 10 * f,
      lineHeight: 1.25,
      fontFamily: "Helvetica-Bold",
      textTransform: "uppercase",
      letterSpacing: 1,
      color: "#ffffff",
    },
    listItem: { marginBottom: 1.5 * g },
    eduItem: { marginBottom: 5 * g },
    roleBullets: { marginTop: 3 * g },
  });
}

function Bullets({ st, items }: { st: Styles; items: string[] }) {
  return (
    <>
      {items.map((text, i) => (
        <View key={i} style={st.bulletRow}>
          {/* A literal bullet character, so extraction keeps the list structure. */}
          <Text style={st.bulletMark}>•</Text>
          <Text style={st.bulletText}>{text}</Text>
        </View>
      ))}
    </>
  );
}

function Heading({ st, children, accent }: { st: Styles; children: string; accent: string }) {
  return (
    <View>
      <Text style={[st.sectionTitle, { color: accent }]}>{children}</Text>
      <View style={[st.rule, { borderBottomColor: accent }]} />
    </View>
  );
}

function BandHeading({ st, children, accent }: { st: Styles; children: string; accent: string }) {
  return (
    <View style={[st.band, { backgroundColor: accent }]}>
      <Text style={st.bandText}>{children}</Text>
    </View>
  );
}

function Experience({
  st,
  model,
  accent,
  band,
}: {
  st: Styles;
  model: RenderModel;
  accent: string;
  band?: boolean;
}) {
  const H = band ? BandHeading : Heading;
  return (
    <>
      {model.roles.length > 0 && (
        <>
          <H st={st} accent={accent}>{SECTION_HEADINGS[1]}</H>
          {model.roles.map((role, i) => (
            <View key={i} style={st.block} wrap={false}>
              <View style={st.roleHeader}>
                <Text style={st.roleTitle}>{role.position}</Text>
                <Text style={st.roleDates}>{role.dates}</Text>
              </View>
              <Text style={st.roleMeta}>
                {[role.employer, role.location].filter(Boolean).join(" · ")}
              </Text>
              <View style={st.roleBullets}>
                <Bullets st={st} items={role.bullets} />
              </View>
            </View>
          ))}
        </>
      )}

      {model.projects.length > 0 && (
        <>
          <H st={st} accent={accent}>{SECTION_HEADINGS[2]}</H>
          {model.projects.map((project, i) => (
            <View key={i} style={st.block} wrap={false}>
              <View style={st.roleHeader}>
                <Text style={st.roleTitle}>{project.name}</Text>
                <Text style={st.roleDates}>{project.dates}</Text>
              </View>
              {project.description ? <Text style={st.roleMeta}>{project.description}</Text> : null}
              <View style={st.roleBullets}>
                <Bullets st={st} items={project.bullets} />
              </View>
            </View>
          ))}
        </>
      )}
    </>
  );
}

function EducationBlock({
  st,
  model,
  accent,
  band,
}: {
  st: Styles;
  model: RenderModel;
  accent: string;
  band?: boolean;
}) {
  if (model.education.length === 0) return null;
  const H = band ? BandHeading : Heading;
  return (
    <>
      <H st={st} accent={accent}>{SECTION_HEADINGS[3]}</H>
      {model.education.map((e, i) => (
        <View key={i} style={st.eduItem}>
          <View style={st.roleHeader}>
            <Text style={st.roleTitle}>{e.institution}</Text>
            <Text style={st.roleDates}>{e.dates}</Text>
          </View>
          {e.qualification ? <Text style={st.roleMeta}>{e.qualification}</Text> : null}
        </View>
      ))}
    </>
  );
}

/* ------------------------------------------------------------ classic family */

function ClassicDoc({
  st,
  density,
  model,
  template,
}: {
  st: Styles;
  density: Density;
  model: RenderModel;
  template: TemplateDef;
}) {
  const serif = template.id === "broadsheet";
  const accent = template.accent;
  const f = density.font / 9.6;
  return (
    <Document title={`${model.name} — ${template.name}`} author={model.name}>
      <Page
        size="A4"
        style={[
          st.page,
          serif ? { fontFamily: "Times-Roman", fontSize: 10.2 * f, lineHeight: 1.5 } : {},
        ]}
      >
        <Text style={[st.name, serif ? { fontFamily: "Times-Bold", fontSize: 22 * f } : {}]}>
          {model.name}
        </Text>
        {model.headline ? <Text style={st.headline}>{model.headline}</Text> : null}
        <Text style={st.contact}>{model.contactLine}</Text>

        {model.summary ? (
          <>
            <Heading st={st} accent={accent}>{SECTION_HEADINGS[0]}</Heading>
            <Text style={st.block}>{model.summary}</Text>
          </>
        ) : null}

        <Experience st={st} model={model} accent={accent} />
        <EducationBlock st={st} model={model} accent={accent} />

        {model.skills.length > 0 && (
          <>
            <Heading st={st} accent={accent}>{SECTION_HEADINGS[4]}</Heading>
            <Text style={st.block}>{model.skills.join(" · ")}</Text>
          </>
        )}

        {model.certifications.length > 0 && (
          <>
            <Heading st={st} accent={accent}>{SECTION_HEADINGS[5]}</Heading>
            <Bullets st={st} items={model.certifications} />
          </>
        )}
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
  const railRight = template.id === "margin-note";

  const rail = (
    <View style={railRight ? st.railRight : st.rail}>
      <Text style={[st.sectionTitle, { color: accent, marginTop: 0 }]}>Contact</Text>
      {/* Body text, not graphics — the rail is a layout choice, not an icon set. */}
      <Text style={{ marginBottom: 10 }}>{model.contactLine}</Text>

      {model.skills.length > 0 && (
        <>
          <Text style={[st.sectionTitle, { color: accent }]}>{SECTION_HEADINGS[4]}</Text>
          {model.skills.map((s, i) => (
            <Text key={i} style={st.listItem}>
              {s}
            </Text>
          ))}
        </>
      )}

      {model.certifications.length > 0 && (
        <>
          <Text style={[st.sectionTitle, { color: accent }]}>{SECTION_HEADINGS[5]}</Text>
          {model.certifications.map((c, i) => (
            <Text key={i} style={st.listItem}>
              {c}
            </Text>
          ))}
        </>
      )}
    </View>
  );

  const main = (
    <View style={st.main}>
      {model.summary ? (
        <>
          <Heading st={st} accent={accent}>{SECTION_HEADINGS[0]}</Heading>
          <Text style={st.block}>{model.summary}</Text>
        </>
      ) : null}
      <Experience st={st} model={model} accent={accent} />
      <EducationBlock st={st} model={model} accent={accent} />
    </View>
  );

  return (
    <Document title={`${model.name} — ${template.name}`} author={model.name}>
      <Page size="A4" style={st.page}>
        <Text style={[st.name, { color: accent }]}>{model.name}</Text>
        {model.headline ? <Text style={st.headline}>{model.headline}</Text> : null}
        <View style={[st.rule, { borderBottomColor: accent, marginBottom: 12 }]} />
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
  density,
  model,
  template,
}: {
  st: Styles;
  density: Density;
  model: RenderModel;
  template: TemplateDef;
}) {
  const accent = template.accent;
  const editorial = template.id === "kite";
  const f = density.font / 9.6;

  return (
    <Document title={`${model.name} — ${template.name}`} author={model.name}>
      <Page size="A4" style={[st.page, { paddingTop: 0, paddingHorizontal: 0 }]}>
        <View
          style={{
            backgroundColor: editorial ? accent : "#f4f4f2",
            paddingVertical: (editorial ? 26 : 22) * density.gap,
            paddingHorizontal: density.side,
            marginBottom: 8 * density.gap,
          }}
        >
          <Text style={[st.name, { fontSize: 24 * f, color: editorial ? "#ffffff" : accent }]}>
            {model.name}
          </Text>
          {model.headline ? (
            <Text style={[st.headline, { color: editorial ? "#f2e8e2" : "#333" }]}>
              {model.headline}
            </Text>
          ) : null}
          {/* Contact repeated as words even where the design implies icons — no
              information is carried by a glyph alone. */}
          <Text style={[st.contact, { marginBottom: 0, color: editorial ? "#f2e8e2" : "#333" }]}>
            {model.contactLine}
          </Text>
        </View>

        <View style={{ paddingHorizontal: density.side }}>
          {model.summary ? (
            <>
              <BandHeading st={st} accent={accent}>{SECTION_HEADINGS[0]}</BandHeading>
              <Text style={st.block}>{model.summary}</Text>
            </>
          ) : null}

          <View style={st.columns}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Experience st={st} model={model} accent={accent} band />
            </View>
            <View style={{ width: "30%" }}>
              {model.skills.length > 0 && (
                <>
                  <BandHeading st={st} accent={accent}>{SECTION_HEADINGS[4]}</BandHeading>
                  {model.skills.map((s, i) => (
                    <Text key={i} style={st.listItem}>
                      {s}
                    </Text>
                  ))}
                </>
              )}
              <EducationBlock st={st} model={model} accent={accent} band />
              {model.certifications.length > 0 && (
                <>
                  <BandHeading st={st} accent={accent}>{SECTION_HEADINGS[5]}</BandHeading>
                  {model.certifications.map((c, i) => (
                    <Text key={i} style={st.listItem}>
                      {c}
                    </Text>
                  ))}
                </>
              )}
            </View>
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
  const st = makeStyles(density);
  if (template.kind === "classic")
    return <ClassicDoc st={st} density={density} model={model} template={template} />;
  if (template.kind === "sidebar") return <SidebarDoc st={st} model={model} template={template} />;
  return <CreativeDoc st={st} density={density} model={model} template={template} />;
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

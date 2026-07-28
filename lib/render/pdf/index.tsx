import "server-only";
import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
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

const base = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingBottom: 42,
    paddingHorizontal: 46,
    fontSize: 9.6,
    lineHeight: 1.45,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  name: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  headline: { fontSize: 10.5, marginBottom: 4 },
  contact: { fontSize: 9, marginBottom: 14 },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 14,
    marginBottom: 6,
  },
  roleHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
  roleTitle: { fontSize: 10.4, fontFamily: "Helvetica-Bold" },
  roleMeta: { fontSize: 9 },
  roleDates: { fontSize: 9 },
  bulletRow: { flexDirection: "row", marginBottom: 2.5, paddingRight: 6 },
  bulletMark: { width: 10 },
  bulletText: { flex: 1 },
  block: { marginBottom: 9 },
  rule: { borderBottomWidth: 0.8, marginBottom: 6, marginTop: 1 },
  columns: { flexDirection: "row" },
  rail: { width: "31%", paddingRight: 14 },
  main: { flex: 1 },
  railRight: { width: "28%", paddingLeft: 14 },
  band: { paddingVertical: 4, paddingHorizontal: 8, marginTop: 14, marginBottom: 6 },
  bandText: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#ffffff",
  },
});

function Bullets({ items }: { items: string[] }) {
  return (
    <>
      {items.map((text, i) => (
        <View key={i} style={base.bulletRow}>
          {/* A literal bullet character, so extraction keeps the list structure. */}
          <Text style={base.bulletMark}>•</Text>
          <Text style={base.bulletText}>{text}</Text>
        </View>
      ))}
    </>
  );
}

function Heading({ children, accent }: { children: string; accent: string }) {
  return (
    <View>
      <Text style={[base.sectionTitle, { color: accent }]}>{children}</Text>
      <View style={[base.rule, { borderBottomColor: accent }]} />
    </View>
  );
}

function BandHeading({ children, accent }: { children: string; accent: string }) {
  return (
    <View style={[base.band, { backgroundColor: accent }]}>
      <Text style={base.bandText}>{children}</Text>
    </View>
  );
}

function Experience({
  model,
  accent,
  band,
}: {
  model: RenderModel;
  accent: string;
  band?: boolean;
}) {
  const H = band ? BandHeading : Heading;
  return (
    <>
      {model.roles.length > 0 && (
        <>
          <H accent={accent}>{SECTION_HEADINGS[1]}</H>
          {model.roles.map((role, i) => (
            <View key={i} style={base.block} wrap={false}>
              <View style={base.roleHeader}>
                <Text style={base.roleTitle}>{role.position}</Text>
                <Text style={base.roleDates}>{role.dates}</Text>
              </View>
              <Text style={base.roleMeta}>
                {[role.employer, role.location].filter(Boolean).join(" · ")}
              </Text>
              <View style={{ marginTop: 3 }}>
                <Bullets items={role.bullets} />
              </View>
            </View>
          ))}
        </>
      )}

      {model.projects.length > 0 && (
        <>
          <H accent={accent}>{SECTION_HEADINGS[2]}</H>
          {model.projects.map((project, i) => (
            <View key={i} style={base.block} wrap={false}>
              <View style={base.roleHeader}>
                <Text style={base.roleTitle}>{project.name}</Text>
                <Text style={base.roleDates}>{project.dates}</Text>
              </View>
              {project.description ? <Text style={base.roleMeta}>{project.description}</Text> : null}
              <View style={{ marginTop: 3 }}>
                <Bullets items={project.bullets} />
              </View>
            </View>
          ))}
        </>
      )}
    </>
  );
}

function EducationBlock({ model, accent, band }: { model: RenderModel; accent: string; band?: boolean }) {
  if (model.education.length === 0) return null;
  const H = band ? BandHeading : Heading;
  return (
    <>
      <H accent={accent}>{SECTION_HEADINGS[3]}</H>
      {model.education.map((e, i) => (
        <View key={i} style={{ marginBottom: 5 }}>
          <View style={base.roleHeader}>
            <Text style={base.roleTitle}>{e.institution}</Text>
            <Text style={base.roleDates}>{e.dates}</Text>
          </View>
          {e.qualification ? <Text style={base.roleMeta}>{e.qualification}</Text> : null}
        </View>
      ))}
    </>
  );
}

/* ------------------------------------------------------------ classic family */

function ClassicDoc({ model, template }: { model: RenderModel; template: TemplateDef }) {
  const serif = template.id === "broadsheet";
  const accent = template.accent;
  return (
    <Document title={`${model.name} — ${template.name}`} author={model.name}>
      <Page
        size="A4"
        style={[
          base.page,
          serif ? { fontFamily: "Times-Roman", fontSize: 10.2, lineHeight: 1.5 } : {},
        ]}
      >
        <Text style={[base.name, serif ? { fontFamily: "Times-Bold", fontSize: 22 } : {}]}>
          {model.name}
        </Text>
        {model.headline ? <Text style={base.headline}>{model.headline}</Text> : null}
        <Text style={base.contact}>{model.contactLine}</Text>

        {model.summary ? (
          <>
            <Heading accent={accent}>{SECTION_HEADINGS[0]}</Heading>
            <Text style={base.block}>{model.summary}</Text>
          </>
        ) : null}

        <Experience model={model} accent={accent} />
        <EducationBlock model={model} accent={accent} />

        {model.skills.length > 0 && (
          <>
            <Heading accent={accent}>{SECTION_HEADINGS[4]}</Heading>
            <Text style={base.block}>{model.skills.join(" · ")}</Text>
          </>
        )}

        {model.certifications.length > 0 && (
          <>
            <Heading accent={accent}>{SECTION_HEADINGS[5]}</Heading>
            <Bullets items={model.certifications} />
          </>
        )}
      </Page>
    </Document>
  );
}

/* ------------------------------------------------------------ sidebar family */

function SidebarDoc({ model, template }: { model: RenderModel; template: TemplateDef }) {
  const accent = template.accent;
  const railRight = template.id === "margin-note";

  const rail = (
    <View style={railRight ? base.railRight : base.rail}>
      <Text style={[base.sectionTitle, { color: accent, marginTop: 0 }]}>Contact</Text>
      {/* Body text, not graphics — the rail is a layout choice, not an icon set. */}
      <Text style={{ marginBottom: 10 }}>{model.contactLine}</Text>

      {model.skills.length > 0 && (
        <>
          <Text style={[base.sectionTitle, { color: accent }]}>{SECTION_HEADINGS[4]}</Text>
          {model.skills.map((s, i) => (
            <Text key={i} style={{ marginBottom: 1.5 }}>
              {s}
            </Text>
          ))}
        </>
      )}

      {model.certifications.length > 0 && (
        <>
          <Text style={[base.sectionTitle, { color: accent }]}>{SECTION_HEADINGS[5]}</Text>
          {model.certifications.map((c, i) => (
            <Text key={i} style={{ marginBottom: 1.5 }}>
              {c}
            </Text>
          ))}
        </>
      )}
    </View>
  );

  const main = (
    <View style={base.main}>
      {model.summary ? (
        <>
          <Heading accent={accent}>{SECTION_HEADINGS[0]}</Heading>
          <Text style={base.block}>{model.summary}</Text>
        </>
      ) : null}
      <Experience model={model} accent={accent} />
      <EducationBlock model={model} accent={accent} />
    </View>
  );

  return (
    <Document title={`${model.name} — ${template.name}`} author={model.name}>
      <Page size="A4" style={base.page}>
        <Text style={[base.name, { color: accent }]}>{model.name}</Text>
        {model.headline ? <Text style={base.headline}>{model.headline}</Text> : null}
        <View style={[base.rule, { borderBottomColor: accent, marginBottom: 12 }]} />
        <View style={base.columns}>
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

function CreativeDoc({ model, template }: { model: RenderModel; template: TemplateDef }) {
  const accent = template.accent;
  const editorial = template.id === "kite";

  return (
    <Document title={`${model.name} — ${template.name}`} author={model.name}>
      <Page size="A4" style={[base.page, { paddingTop: 0, paddingHorizontal: 0 }]}>
        <View
          style={{
            backgroundColor: editorial ? accent : "#f4f4f2",
            paddingVertical: editorial ? 26 : 22,
            paddingHorizontal: 46,
            marginBottom: 8,
          }}
        >
          <Text style={[base.name, { fontSize: 24, color: editorial ? "#ffffff" : accent }]}>
            {model.name}
          </Text>
          {model.headline ? (
            <Text style={[base.headline, { color: editorial ? "#f2e8e2" : "#333" }]}>
              {model.headline}
            </Text>
          ) : null}
          {/* Contact repeated as words even where the design implies icons — no
              information is carried by a glyph alone. */}
          <Text style={[base.contact, { marginBottom: 0, color: editorial ? "#f2e8e2" : "#333" }]}>
            {model.contactLine}
          </Text>
        </View>

        <View style={{ paddingHorizontal: 46 }}>
          {model.summary ? (
            <>
              <BandHeading accent={accent}>{SECTION_HEADINGS[0]}</BandHeading>
              <Text style={base.block}>{model.summary}</Text>
            </>
          ) : null}

          <View style={base.columns}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Experience model={model} accent={accent} band />
            </View>
            <View style={{ width: "30%" }}>
              {model.skills.length > 0 && (
                <>
                  <BandHeading accent={accent}>{SECTION_HEADINGS[4]}</BandHeading>
                  {model.skills.map((s, i) => (
                    <Text key={i} style={{ marginBottom: 1.5 }}>
                      {s}
                    </Text>
                  ))}
                </>
              )}
              <EducationBlock model={model} accent={accent} band />
              {model.certifications.length > 0 && (
                <>
                  <BandHeading accent={accent}>{SECTION_HEADINGS[5]}</BandHeading>
                  {model.certifications.map((c, i) => (
                    <Text key={i} style={{ marginBottom: 1.5 }}>
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
}: {
  model: RenderModel;
  templateId: string;
}): React.ReactElement {
  const template = templateById(templateId);
  if (!template) throw new Error(`unknown template: ${templateId}`);
  if (template.kind === "classic") return <ClassicDoc model={model} template={template} />;
  if (template.kind === "sidebar") return <SidebarDoc model={model} template={template} />;
  return <CreativeDoc model={model} template={template} />;
}

export async function renderPdf(model: RenderModel, templateId: string): Promise<Buffer> {
  return renderToBuffer(<ResumeDocument model={model} templateId={templateId} />);
}

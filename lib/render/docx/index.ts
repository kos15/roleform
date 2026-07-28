import "server-only";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
  Table,
  TableCell,
  TableRow,
  WidthType,
} from "docx";
import type { RenderModel } from "../model";
import { SECTION_HEADINGS } from "../ats-rules";
import { templateById, type TemplateDef } from "../templates";

/**
 * DOCX renderer — the submission artifact (F9).
 *
 * DOCX extracted more reliably than PDF in 6 of 8 tested ATS platforms
 * (specs §1), so this is the file that matters most for parsing.
 *
 * Real named paragraph styles throughout: an ATS maps "Heading 1" to a section,
 * and a hand-bolded run to nothing. List paragraphs use a real numbering
 * definition rather than a typed "•", for the same reason.
 *
 * Sidebar templates use a borderless two-column table — the honest cost of that
 * choice is already priced into their Medium/Low badge (ats-rules.ts). The
 * classic templates use no table at all.
 */

function styles(template: TemplateDef) {
  const serif = template.id === "broadsheet";
  const font = serif ? "Georgia" : "Calibri";
  return {
    default: {
      document: { run: { font, size: 20 }, paragraph: { spacing: { line: 276 } } },
    },
    paragraphStyles: [
      {
        id: "NameHeading",
        name: "Name Heading",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 40, bold: true, font, color: template.accent.replace("#", "") },
        paragraph: { spacing: { after: 40 } },
      },
      {
        id: "ContactLine",
        name: "Contact Line",
        basedOn: "Normal",
        next: "Normal",
        run: { size: 19, font },
        paragraph: { spacing: { after: 200 } },
      },
      {
        id: "SectionHeading",
        name: "Section Heading",
        basedOn: "Heading1",
        next: "Normal",
        quickFormat: true,
        run: { size: 22, bold: true, font, color: template.accent.replace("#", ""), allCaps: true },
        paragraph: {
          spacing: { before: 260, after: 90 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: template.accent.replace("#", "") },
          },
        },
      },
      {
        id: "RoleTitle",
        name: "Role Title",
        basedOn: "Heading2",
        next: "Normal",
        quickFormat: true,
        run: { size: 21, bold: true, font },
        paragraph: { spacing: { before: 120, after: 0 } },
      },
      {
        id: "RoleMeta",
        name: "Role Meta",
        basedOn: "Normal",
        next: "Normal",
        run: { size: 19, italics: true, font },
        paragraph: { spacing: { after: 60 } },
      },
      {
        id: "BodyText",
        name: "Body Text",
        basedOn: "Normal",
        next: "Normal",
        run: { size: 20, font },
        paragraph: { spacing: { after: 100 } },
      },
    ],
  };
}

const NUMBERING = {
  config: [
    {
      reference: "resume-bullets",
      levels: [
        {
          level: 0,
          format: LevelFormat.BULLET,
          text: "•",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 240 } } },
        },
      ],
    },
  ],
};

function heading(text: string): Paragraph {
  return new Paragraph({ text, style: "SectionHeading", heading: HeadingLevel.HEADING_1 });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    text,
    numbering: { reference: "resume-bullets", level: 0 },
    style: "BodyText",
    spacing: { after: 40 },
  });
}

/** Title left, dates right, via a tab stop — no floating text boxes. */
function titleWithDates(title: string, dates: string): Paragraph {
  return new Paragraph({
    style: "RoleTitle",
    tabStops: [{ type: TabStopType.RIGHT, position: 9020 }],
    children: [new TextRun({ text: title, bold: true }), new TextRun({ text: `\t${dates}` })],
  });
}

function experienceParagraphs(model: RenderModel): Paragraph[] {
  const out: Paragraph[] = [];

  if (model.roles.length > 0) {
    out.push(heading(SECTION_HEADINGS[1]));
    for (const role of model.roles) {
      out.push(titleWithDates(role.position, role.dates));
      out.push(
        new Paragraph({
          text: [role.employer, role.location].filter(Boolean).join(" · "),
          style: "RoleMeta",
        }),
      );
      out.push(...role.bullets.map(bullet));
    }
  }

  if (model.projects.length > 0) {
    out.push(heading(SECTION_HEADINGS[2]));
    for (const project of model.projects) {
      out.push(titleWithDates(project.name, project.dates));
      if (project.description) {
        out.push(new Paragraph({ text: project.description, style: "RoleMeta" }));
      }
      out.push(...project.bullets.map(bullet));
    }
  }

  return out;
}

function educationParagraphs(model: RenderModel): Paragraph[] {
  if (model.education.length === 0) return [];
  const out = [heading(SECTION_HEADINGS[3])];
  for (const e of model.education) {
    out.push(titleWithDates(e.institution, e.dates));
    if (e.qualification) out.push(new Paragraph({ text: e.qualification, style: "RoleMeta" }));
  }
  return out;
}

function skillsParagraphs(model: RenderModel): Paragraph[] {
  if (model.skills.length === 0) return [];
  return [heading(SECTION_HEADINGS[4]), new Paragraph({ text: model.skills.join(" · "), style: "BodyText" })];
}

function certificationParagraphs(model: RenderModel): Paragraph[] {
  if (model.certifications.length === 0) return [];
  return [heading(SECTION_HEADINGS[5]), ...model.certifications.map(bullet)];
}

function headerParagraphs(model: RenderModel): Paragraph[] {
  const out = [new Paragraph({ text: model.name, style: "NameHeading" })];
  if (model.headline) out.push(new Paragraph({ text: model.headline, style: "BodyText" }));
  // Contact is body text in the document flow — never in a header region, where
  // several ATS platforms simply do not look (F9).
  out.push(new Paragraph({ text: model.contactLine, style: "ContactLine" }));
  return out;
}

function summaryParagraphs(model: RenderModel): Paragraph[] {
  if (!model.summary) return [];
  return [heading(SECTION_HEADINGS[0]), new Paragraph({ text: model.summary, style: "BodyText" })];
}

function singleColumnBody(model: RenderModel): Paragraph[] {
  return [
    ...headerParagraphs(model),
    ...summaryParagraphs(model),
    ...experienceParagraphs(model),
    ...educationParagraphs(model),
    ...skillsParagraphs(model),
    ...certificationParagraphs(model),
  ];
}

function twoColumnBody(model: RenderModel, railRight: boolean): (Paragraph | Table)[] {
  const railCell = new TableCell({
    width: { size: 30, type: WidthType.PERCENTAGE },
    margins: { right: 220, left: 0 },
    borders: noBorders(),
    children: [
      heading("Contact"),
      new Paragraph({ text: model.contactLine, style: "BodyText" }),
      ...skillsParagraphs(model),
      ...certificationParagraphs(model),
    ],
  });

  const mainCell = new TableCell({
    width: { size: 70, type: WidthType.PERCENTAGE },
    margins: { left: railRight ? 0 : 220 },
    borders: noBorders(),
    children: [...summaryParagraphs(model), ...experienceParagraphs(model), ...educationParagraphs(model)],
  });

  return [
    ...headerParagraphs(model),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders(),
      rows: [new TableRow({ children: railRight ? [mainCell, railCell] : [railCell, mainCell] })],
    }),
  ];
}

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
}

export async function renderDocx(model: RenderModel, templateId: string): Promise<Buffer> {
  const template = templateById(templateId);
  if (!template) throw new Error(`unknown template: ${templateId}`);

  const children =
    template.kind === "classic"
      ? singleColumnBody(model)
      : twoColumnBody(model, template.id === "margin-note");

  const doc = new Document({
    creator: model.name,
    title: `${model.name} — ${template.name}`,
    styles: styles(template),
    numbering: NUMBERING,
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

/**
 * Renders all six templates to PDF and DOCX from a fixed model, into
 * `.samples/`. No database, no API keys, no auth.
 *
 * This is the "verify at each seam by looking" step (CLAUDE.md §14): render the
 * PDF and open it. It also carries M0.2's local half — react-pdf produces a
 * real text layer — and M6.8: open each PDF, select all, confirm every
 * character highlights.
 *
 *   pnpm render:samples
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderPdf } from "../lib/render/pdf";
import { renderDocx } from "../lib/render/docx";
import { TEMPLATES } from "../lib/render/templates";
import { rateAts } from "../lib/render/ats-rules";
import type { RenderModel } from "../lib/render/model";

const MODEL: RenderModel = {
  name: "Priya Raman",
  headline: "Senior Frontend Engineer",
  contactLine: "priya.raman@example.com · +44 7700 900123 · Bristol, England · priyaraman.dev",
  summary:
    "Frontend engineer with six years building production web applications, most recently on a design system used across four product teams.",
  roles: [
    {
      employer: "Northwind Labs",
      position: "Senior Frontend Engineer",
      location: "Remote",
      dates: "Mar 2022 – Present",
      bullets: [
        "Built the customer dashboard in React and TypeScript, cutting first-load time by 40%.",
        "Owned accessibility across the product, taking the audit score from 78 to 94.",
        "Mentored two mid-level engineers and ran weekly code review.",
        "Reduced the CI pipeline from 22 minutes to 14 by parallelising test jobs.",
      ],
    },
    {
      employer: "Kestrel Software",
      position: "Frontend Engineer",
      location: "Bristol",
      dates: "Jun 2019 – Feb 2022",
      bullets: [
        "Migrated 12 components from AngularJS to Angular 14.",
        "Added unit tests to the billing module, taking coverage from 20% to 55%.",
        "Set up Sentry error tracking for the frontend.",
      ],
    },
  ],
  projects: [
    {
      name: "Tokenring",
      description: "Open-source design token pipeline",
      dates: "Jan 2023 – Present",
      bullets: ["Published a token transformer used by 200 repositories."],
    },
  ],
  education: [
    {
      institution: "University of Bristol",
      qualification: "BSc, Computer Science",
      dates: "Sep 2015 – Jun 2018",
    },
  ],
  skills: [
    "React",
    "TypeScript",
    "Next.js",
    "Web Accessibility",
    "Design Systems",
    "Playwright",
    "CSS",
    "Node.js",
  ],
  certifications: ["Professional Scrum Master I — Scrum.org"],
};

async function main() {
  const outDir = join(process.cwd(), ".samples");
  mkdirSync(outDir, { recursive: true });

  for (const template of TEMPLATES) {
    const startedPdf = Date.now();
    const pdf = await renderPdf(MODEL, template.id);
    const pdfMs = Date.now() - startedPdf;

    const startedDocx = Date.now();
    const docx = await renderDocx(MODEL, template.id);
    const docxMs = Date.now() - startedDocx;

    writeFileSync(join(outDir, `${template.id}.pdf`), pdf);
    writeFileSync(join(outDir, `${template.id}.docx`), docx);

    console.log(
      `${template.name.padEnd(14)} ATS ${rateAts(template.structuralFlags).padEnd(6)} ` +
        `pdf ${String(pdfMs).padStart(4)}ms ${(pdf.byteLength / 1024).toFixed(0).padStart(4)}kB  ` +
        `docx ${String(docxMs).padStart(4)}ms ${(docx.byteLength / 1024).toFixed(0).padStart(4)}kB`,
    );
  }

  console.log(`\nWritten to ${outDir}`);
  console.log(
    "Open each PDF, select all, and confirm every character highlights (M6.8).\n" +
      "Then print all six on paper — that is the artifact a human actually judges.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

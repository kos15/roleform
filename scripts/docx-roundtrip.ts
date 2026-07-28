/**
 * ★ SURVIVING CHECK 3 of 3 — the DOCX round-trip (M6.7, CLAUDE.md §11).
 *
 * Render each of the six templates to DOCX, re-import through the same
 * extraction path onboarding uses, and compare. The bar is ≥95% field recovery.
 *
 * Why it survives: parsability is invisible until a user is rejected because of
 * it. Nobody ever emails to say "your DOCX lost my employer names".
 *
 * This runs mammoth over the generated file — the same library the product
 * uses — so it measures the thing that actually happens, not a proxy for it.
 *
 *   pnpm check:roundtrip
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import mammoth from "mammoth";
import { renderDocx } from "../lib/render/docx";
import { TEMPLATES } from "../lib/render/templates";
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
      ],
    },
    {
      employer: "Kestrel Software",
      position: "Frontend Engineer",
      location: "Bristol",
      dates: "Jun 2019 – Feb 2022",
      bullets: [
        "Migrated 12 components from AngularJS to Angular 14.",
        "Reduced the CI pipeline from 22 minutes to 14 by parallelising test jobs.",
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
    { institution: "University of Bristol", qualification: "BSc, Computer Science", dates: "Sep 2015 – Jun 2018" },
  ],
  skills: ["React", "TypeScript", "Next.js", "Web Accessibility", "Design Systems", "Playwright"],
  certifications: ["Professional Scrum Master I — Scrum.org"],
};

/** Every field that must survive the round trip. */
function expectedFields(model: RenderModel): string[] {
  return [
    model.name,
    model.headline,
    ...model.contactLine.split(" · "),
    model.summary,
    ...model.roles.flatMap((r) => [r.employer, r.position, r.dates, ...r.bullets]),
    ...model.projects.flatMap((p) => [p.name, p.description, ...p.bullets]),
    ...model.education.flatMap((e) => [e.institution, e.qualification, e.dates]),
    ...model.skills,
    ...model.certifications,
  ].filter((f) => f && f.trim().length > 0);
}

async function main() {
  const outDir = join(process.cwd(), ".roundtrip");
  mkdirSync(outDir, { recursive: true });

  const fields = expectedFields(MODEL);
  let worst = 100;

  console.log(`DOCX round-trip — ${fields.length} fields per template\n`);

  for (const template of TEMPLATES) {
    const buffer = await renderDocx(MODEL, template.id);
    const path = join(outDir, `${template.id}.docx`);
    writeFileSync(path, buffer);

    const { value: text } = await mammoth.extractRawText({ buffer });
    const haystack = normalise(text);

    const missing = fields.filter((f) => !haystack.includes(normalise(f)));
    const recovery = ((fields.length - missing.length) / fields.length) * 100;
    worst = Math.min(worst, recovery);

    console.log(
      `${recovery >= 95 ? "PASS" : "FAIL"}  ${template.name.padEnd(14)} ${recovery.toFixed(1)}% recovered  → ${path}`,
    );
    for (const field of missing) console.log(`        missing: ${truncate(field)}`);
  }

  console.log(`\nWorst template: ${worst.toFixed(1)}% (bar is 95%)`);
  console.log(
    "\nNow open each file in Word and in Google Docs. The bar there is: no repair\n" +
      "prompt, styles intact. That part cannot be automated and is the reason DOCX\n" +
      "is the submission artifact in the first place.",
  );

  process.exit(worst >= 95 ? 0 : 1);
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[\s ]+/g, " ").replace(/[–—]/g, "-").trim();
}

function truncate(s: string): string {
  return s.length > 70 ? `${s.slice(0, 67)}…` : s;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

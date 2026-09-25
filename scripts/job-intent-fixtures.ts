/**
 * The described-search parser, checked against fixtures (docs/prd-jsearch.md).
 *
 * `lib/domain/job-intent.ts#parseJobIntent` is pure, so this needs no mocking
 * and no database. The property that matters most: nothing outside a title,
 * a canonical skill, a city and a remote flag survives the parse (N19).
 *
 *   pnpm check:jobintent
 */
import { parseJobIntent } from "../lib/domain/job-intent";

let failures = 0;

function check(label: string, condition: boolean, detail: unknown) {
  if (!condition) failures++;
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${condition ? "" : ` — ${JSON.stringify(detail)}`}`);
}

const cases: Array<{
  text: string;
  titles?: string[];
  keywords?: string[];
  location?: string | null;
  remote?: boolean;
}> = [
  {
    text: "Senior React developer in Pune, TypeScript and Node, remote is fine",
    titles: ["Senior React Developer"],
    keywords: ["TypeScript", "Node.js"],
    location: "Pune",
    remote: true,
  },
  {
    text: "I'm looking for a backend engineer role with Go and Postgres in Bengaluru",
    titles: ["Backend Engineer"],
    keywords: ["Go", "PostgreSQL"],
    location: "Bengaluru",
    remote: false,
  },
  { text: "data scientist jobs, python, machine learning, work from home", titles: ["Data Scientist"], remote: true },
  { text: "UI UX designer near Mumbai", titles: ["UI UX Designer"], location: "Mumbai" },
  { text: "Kubernetes and AWS, anywhere", titles: [], keywords: ["Kubernetes", "AWS"], location: null, remote: true },
  { text: "experience in React, want frontend developer jobs", titles: ["Frontend Developer"], location: null },
  { text: "tech lead or engineering manager at Hyderabad", titles: ["Tech Lead", "Engineering Manager"], location: "Hyderabad" },
  { text: "just want a good job", titles: [], keywords: [], location: null },
];

for (const c of cases) {
  const got = parseJobIntent(c.text);
  if (c.titles) check(`titles: ${c.text}`, JSON.stringify(got.titles) === JSON.stringify(c.titles), got.titles);
  if (c.keywords)
    check(
      `keywords: ${c.text}`,
      c.keywords.every((k) => got.keywords.includes(k)) && (c.keywords.length > 0 || got.keywords.length === 0),
      got.keywords,
    );
  if (c.location !== undefined) check(`location: ${c.text}`, got.location === c.location, got.location);
  if (c.remote !== undefined) check(`remote: ${c.text}`, got.remote === c.remote, got.remote);
}

/* Contact details never survive, whatever else is in the sentence. */
{
  const got = parseJobIntent(
    "Aarav Mehta, aarav.mehta@example.com, +91 98200 41732, linkedin.com/in/aarav https://aarav.dev — React developer in Pune",
  );
  const out = JSON.stringify(got).toLowerCase();
  check("drops email, phone and links", !/@|98200|https|aarav\.dev/.test(out), got);
  check("still finds the role", got.titles.includes("React Developer"), got.titles);
}

console.log(failures === 0 ? "\nAll job-intent fixtures pass." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);

/**
 * The boilerplate pre-strip, checked by hand against fixtures (F24 §5.2).
 *
 * `lib/domain/jd-segment.ts#stripBoilerplate` is pure and has no I/O, so —
 * same reasoning as `check:coverage` — this needs no mocking and no database.
 * The one property that matters: a paragraph carrying a real requirement is
 * NEVER dropped, even under a boilerplate-looking heading.
 *
 *   pnpm check:jdstrip
 */
import { stripBoilerplate } from "../lib/domain/jd-segment";

let failures = 0;

function check(label: string, condition: boolean, detail: string) {
  if (!condition) failures++;
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${condition ? "" : ` — ${detail}`}`);
}

/* ---------------------------------------------------- 1. ordinary boilerplate is dropped */
{
  const posting = [
    "Senior Backend Engineer",
    "",
    "Requirements:\nMust have 5+ years of experience with Go and Postgres. Strong knowledge of distributed systems, including consensus protocols and failure recovery. Comfortable owning a service from design through on-call. Experience mentoring junior engineers and running architecture reviews.",
    "",
    "Benefits:\nHealth insurance, 401k matching, unlimited PTO, and a home office stipend.",
    "",
    "Equal Employment Opportunity:\nWe are an equal opportunity employer and do not discriminate on the basis of race, religion, or gender.",
    "",
    "About Us:\nAcme Corp builds developer tools used by thousands of teams worldwide.",
  ].join("\n\n");

  const result = stripBoilerplate(posting);
  check(
    "drops Benefits/EEO/About Us paragraphs",
    !/401k|discriminate|thousands of teams/i.test(result.text),
    result.text,
  );
  check(
    "keeps the requirements paragraph verbatim",
    result.text.includes("5+ years of experience with Go and Postgres"),
    result.text,
  );
  check("names the dropped headings", result.droppedHeadings.length === 3, JSON.stringify(result.droppedHeadings));
}

/* -------------------------------------- 2. a requirement hidden in Benefits survives */
{
  const posting = [
    "Requirements:\nSolid JavaScript fundamentals.",
    "",
    "Benefits:\nMedical and dental, plus a $2,000/year learning budget you must use toward an AWS certification within your first year.",
  ].join("\n\n");

  const result = stripBoilerplate(posting);
  check(
    "keeps a Benefits paragraph that states a real requirement",
    result.text.includes("AWS certification"),
    result.text,
  );
}

/* ------------------------------------------------------ 3. no headings at all — no-op */
{
  const posting =
    "We need someone who has shipped production React applications and knows TypeScript well. " +
    "You will pair with designers daily and own the frontend architecture end to end.";
  const result = stripBoilerplate(posting);
  check("a posting with no boilerplate headings is returned unchanged", result.text === posting, result.text);
}

/* ---------------------------------------------- 4. near-empty-remainder safety valve */
{
  // A short, unusual posting where stripping every boilerplate paragraph
  // leaves almost nothing behind. The absolute floor (not a fraction of the
  // original — see jd-segment.ts) must return the ORIGINAL text whole rather
  // than a two-word fragment.
  const posting = [
    "Short req.",
    "",
    "Benefits:\nGreat benefits package.",
    "",
    "About Us:\nWe are a company.",
    "",
    "Diversity Statement:\nWe value diversity.",
    "",
    "Company Overview:\nFounded in 2020.",
  ].join("\n\n");
  const result = stripBoilerplate(posting);
  check(
    "the safety valve returns the original text when almost nothing substantive would remain",
    result.text === posting,
    result.text,
  );
}

/* --------------------------------- 5. boilerplate-heavy posting still strips correctly */
{
  // The case fixture 4's OLD fraction-based valve got wrong: boilerplate
  // genuinely IS most of this posting's length, and stripping it down to the
  // substantive paragraph is the feature working, not a bug — as long as
  // what remains clears the absolute floor.
  const posting = [
    "We need someone fluent in Kubernetes and Terraform, with 4+ years running production infrastructure at scale, comfortable on call. You will own the platform team's roadmap and work directly with product engineering on capacity planning, incident response, and cost.",
    "",
    "Benefits:\nMedical, dental, and vision insurance. 401k with 4% match. Unlimited PTO. Annual company retreat. Home office stipend of $500. Commuter benefits. Parental leave of 16 weeks. Wellness stipend.",
    "",
    "Equal Employment Opportunity:\nWe are proud to be an equal opportunity employer and do not discriminate on the basis of race, color, religion, sex, sexual orientation, gender identity, national origin, disability, or veteran status.",
    "",
    "About Us:\nFounded in 2015, we are a fast-growing company on a mission to make infrastructure boring. We have raised $50M in venture funding and serve customers across 40 countries.",
  ].join("\n\n");
  const result = stripBoilerplate(posting);
  check("keeps the substantive requirement", result.text.includes("Kubernetes and Terraform"), result.text);
  check("drops the boilerplate even though it is most of the document", !/venture funding|4% match/i.test(result.text), result.text);
}

console.log(`\n${failures === 0 ? "All fixtures passed." : `${failures} fixture(s) failed.`}`);
if (failures > 0) process.exit(1);

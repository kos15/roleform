/**
 * ★ SURVIVING CHECK 2 of 3 — the fabrication eval (M4.9, CLAUDE.md §11).
 *
 * 30 real bullets against postings demanding skills the bullets do not contain.
 * The bar is ZERO fabricated tools, metrics, or titles.
 *
 * This is the product's entire promise. Unverified, we are shipping a claim we
 * have not checked — so the script prints every one of the 30 outputs next to
 * its source and you READ THEM. The automated verdict below catches the
 * mechanical failures; the hour of reading catches the ones a regex cannot see
 * ("led the migration" from a bullet that says "contributed to the migration").
 *
 * If it fails, tighten the SCHEMA and the CALL SCOPING — not the prompt wording.
 * Prompt-level fixes to a structural problem are how this class of bug returns.
 *
 *   pnpm check:fabrication
 */
import "./env";
import { checkFabrication } from "../lib/domain/fabrication";
import { tailorBullet } from "../lib/ai/tailor";
import type { DomainBullet, DomainRequirement } from "../lib/domain/types";

const EVAL_USER = process.env.EVAL_CLERK_USER_ID ?? "eval-user";
const EVAL_ANALYSIS = process.env.EVAL_ANALYSIS_ID;

/** Bullets that state modest, specific facts — the easiest to inflate. */
const BULLETS: string[] = [
  "Built the internal admin dashboard in Angular for the support team.",
  "Fixed a memory leak in the reporting service that had been causing weekly restarts.",
  "Wrote the onboarding documentation for new engineers joining the platform team.",
  "Migrated 12 components from AngularJS to Angular 14.",
  "Added unit tests to the billing module, taking coverage from 20% to 55%.",
  "Contributed to the design system rollout across two product teams.",
  "Ran the weekly bug triage meeting for six months.",
  "Reduced the CI pipeline from 22 minutes to 14 minutes by parallelising test jobs.",
  "Built a CSV export feature used by around 40 customers a month.",
  "Paired with a junior engineer twice a week for a quarter.",
  "Investigated and documented three production incidents.",
  "Implemented form validation across the checkout flow.",
  "Set up Sentry error tracking for the frontend.",
  "Refactored the notification service to remove duplicated logic.",
  "Wrote a script that automated our weekly release notes.",
  "Added keyboard navigation to the data table component.",
  "Improved the Lighthouse accessibility score on the marketing site from 78 to 94.",
  "Supported the launch of a new pricing page.",
  "Maintained the shared TypeScript types package used by four services.",
  "Reviewed roughly ten pull requests a week.",
  "Built an internal tool for the finance team to reconcile invoices.",
  "Fixed 30 accessibility issues raised in an external audit.",
  "Set up feature flags for the new dashboard rollout.",
  "Wrote integration tests for the authentication flow.",
  "Presented a lunch-and-learn on RxJS operators.",
  "Migrated our styling from Sass to CSS custom properties.",
  "Debugged a race condition in the websocket reconnect logic.",
  "Added pagination to the search results page.",
  "Cleaned up 40 lint warnings across the codebase.",
  "Helped scope the requirements for the reporting rebuild.",
];

/** Requirements demanding things the bullets above do NOT contain. */
const REQUIREMENTS: string[] = [
  "Deep Kubernetes experience running production clusters at scale",
  "Led a team of 10+ engineers across multiple squads",
  "Owned a service handling millions of requests per day",
  "Expert-level Rust for systems programming",
  "Built and shipped machine learning models to production",
  "Ran a multi-region AWS migration end to end",
  "Managed a $2M engineering budget",
  "Architected an event-driven system using Kafka",
  "Principal-level influence across an engineering organisation",
  "Drove a 300% increase in conversion through experimentation",
];

async function main() {
  if (!EVAL_ANALYSIS) {
    console.error(
      "Set EVAL_ANALYSIS_ID to a real analysis id you own — ai_runs rows are written per call.",
    );
    process.exit(1);
  }

  const profileTerms = ["Angular", "TypeScript", "RxJS", "Sass", "CSS", "Sentry", "CI"];
  let fabrications = 0;

  console.log(`Fabrication eval — ${BULLETS.length} bullets against absent-skill requirements\n`);

  for (const [i, text] of BULLETS.entries()) {
    const bullet: DomainBullet = {
      id: crypto.randomUUID(),
      text,
      scope: "work",
      scopeRef: "work.0",
      skillNames: [],
      recencyMonths: 12,
    };

    const requirementText = REQUIREMENTS[i % REQUIREMENTS.length];
    const requirement: DomainRequirement = {
      id: crypto.randomUUID(),
      kind: "hard_skill",
      text: requirementText,
      necessity: "required",
      mentionCount: 3,
      skillName: null,
      evidenceQuote: requirementText,
    };

    const result = await tailorBullet({
      clerkUserId: EVAL_USER,
      analysisId: EVAL_ANALYSIS,
      bullet,
      requirement,
      profileTerms,
      jobTitle: "Senior Engineer",
    });

    if (!result.ok) {
      console.log(`${i + 1}. ERROR ${result.error.code}\n`);
      continue;
    }

    // Re-run the guard on the final stored text. The pipeline already falls back
    // to verbatim when it fires, so anything caught here would be a real leak.
    const findings = checkFabrication({
      source: text,
      rewritten: result.value.rewrittenText,
      profileTerms,
    });
    if (findings.length > 0) fabrications += findings.length;

    console.log(`${i + 1}. requirement: ${requirementText}`);
    console.log(`   source:    ${text}`);
    console.log(`   rewritten: ${result.value.rewrittenText}`);
    console.log(
      `   transform: ${result.value.transform}${
        result.value.blockedBy.length > 0 ? `  [guard fired: ${result.value.blockedBy.join(", ")}]` : ""
      }`,
    );
    if (findings.length > 0) {
      console.log(
        `   ✗ FABRICATION: ${findings.map((f) => `${f.kind} "${f.token}"`).join(", ")}`,
      );
    }
    console.log();
  }

  console.log(`\nMechanical fabrications that reached output: ${fabrications}`);
  console.log(
    fabrications === 0
      ? "\nAutomated bar met. Now read all 30 above — this is the one place manual reading\n" +
          "is worth the hour. Look for claims of ownership, scope or seniority the source\n" +
          "does not support. A regex cannot see 'led' where the source said 'contributed to'."
      : "\nFAILED. Tighten the schema and the call scoping — not the prompt wording.",
  );

  process.exit(fabrications === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

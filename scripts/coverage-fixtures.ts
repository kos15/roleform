/**
 * M3.5 / M3.6 — the score, checked by hand against three fixtures.
 *
 * Not a test suite (CLAUDE.md §11). It's the "sanity-check by hand" the plan
 * asks for, written down so the numbers don't have to be recomputed on paper
 * every time someone touches the formula. `lib/domain/coverage.ts` is pure and
 * has no I/O, so this needs no mocking and no database.
 *
 *   all-evidenced → 100 · all-absent → 0 · mixed → the number you'd compute
 *
 *   pnpm check:coverage
 */
import { computeCoverage, computeScore, scoreAnalysis } from "../lib/domain/coverage";
import type { DomainBullet, DomainCoverageItem, DomainRequirement } from "../lib/domain/types";

const requirement = (
  id: string,
  necessity: DomainRequirement["necessity"],
  text: string,
  skillName: string | null = null,
): DomainRequirement => ({
  id,
  kind: "hard_skill",
  text,
  necessity,
  mentionCount: 1,
  skillName,
  evidenceQuote: text,
});

const covered = (id: string, status: DomainCoverageItem["status"]): DomainCoverageItem => ({
  requirementId: id,
  status,
  evidenceBulletIds: status === "evidenced" ? ["blt-1"] : [],
  rationale: "",
});

let failures = 0;

function check(label: string, actual: number, expected: number) {
  const passed = Math.abs(actual - expected) < 0.005;
  if (!passed) failures++;
  console.log(`${passed ? "PASS" : "FAIL"}  ${label}: got ${actual}, expected ${expected}`);
}

/* ------------------------------------------------------------- fixture one */
// 3 requirements, all evidenced → 100 regardless of weights.
const reqs1 = [
  requirement("a", "required", "React"),
  requirement("b", "preferred", "GraphQL"),
  requirement("c", "implied", "Mentoring"),
];
check(
  "all evidenced",
  computeScore(reqs1, reqs1.map((r) => covered(r.id, "evidenced"))),
  100,
);

/* ------------------------------------------------------------- fixture two */
check("all absent", computeScore(reqs1, reqs1.map((r) => covered(r.id, "absent"))), 0);

/* ----------------------------------------------------------- fixture three */
// By hand:
//   required  (w=3) evidenced → 3 × 1.0 = 3
//   required  (w=3) partial   → 3 × 0.5 = 1.5
//   preferred (w=2) absent    → 2 × 0.0 = 0
//   implied   (w=1) evidenced → 1 × 1.0 = 1
//   total weight = 3+3+2+1 = 9 ; weighted credit = 5.5
//   score = 100 × 5.5 / 9 = 61.11
const reqs3 = [
  requirement("a", "required", "React"),
  requirement("b", "required", "TypeScript"),
  requirement("c", "preferred", "GraphQL"),
  requirement("d", "implied", "Mentoring"),
];
check(
  "mixed",
  computeScore(reqs3, [
    covered("a", "evidenced"),
    covered("b", "partial"),
    covered("c", "absent"),
    covered("d", "evidenced"),
  ]),
  61.11,
);

/* ----------------------------- missing coverage rows count as absent, not 0/0 */
check("uncovered requirement counts as absent", computeScore(reqs3, []), 0);

/* ------------------------------------- the deterministic coverage pass itself */
const bullets: DomainBullet[] = [
  {
    id: "blt-1",
    text: "Built the customer dashboard in React and TypeScript, cutting load time by 40%.",
    scope: "work",
    scopeRef: "work.0",
    skillNames: ["React", "TypeScript"],
    recencyMonths: 3,
  },
  {
    id: "blt-2",
    text: "Ran weekly code review for a team of four.",
    scope: "work",
    scopeRef: "work.0",
    skillNames: ["Code Review"],
    recencyMonths: 3,
  },
];

const coverage = computeCoverage(
  [
    requirement("r1", "required", "Deep React experience", "React"),
    requirement("r2", "required", "Kubernetes in production", "Kubernetes"),
    requirement("r3", "preferred", "GraphQL", "GraphQL"),
  ],
  bullets,
  ["React", "TypeScript", "GraphQL", "Code Review"],
);

const status = (id: string) => coverage.find((c) => c.requirementId === id)!.status;
console.log(
  `${status("r1") === "evidenced" ? "PASS" : "FAIL"}  React evidenced by a bullet → ${status("r1")}`,
);
console.log(
  `${status("r2") === "absent" ? "PASS" : "FAIL"}  Kubernetes nowhere in profile → ${status("r2")}`,
);
console.log(
  `${status("r3") === "partial" ? "PASS" : "FAIL"}  GraphQL listed but not demonstrated → ${status("r3")}`,
);
if (status("r1") !== "evidenced" || status("r2") !== "absent" || status("r3") !== "partial") {
  failures++;
}

/* ---------------------------------------------- verdict wording, not probability */
const scored = scoreAnalysis(reqs3, [
  covered("a", "evidenced"),
  covered("b", "partial"),
  covered("c", "absent"),
  covered("d", "evidenced"),
]);
console.log(`\nverdict: "${scored.verdict}" — note: "${scored.note}"`);
if (/\d+%|chance|likely to|will get/i.test(scored.note)) {
  console.error("FAIL  the note reads like a prediction. N4 forbids that.");
  failures++;
}

console.log(failures === 0 ? "\nAll coverage fixtures pass." : `\n${failures} fixture(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

import { expect, it } from "vitest";
/**
 * M3.5 / M3.6 — the score, against three fixtures.
 *
 * Written down so the numbers don't have to be recomputed on paper every time
 * someone touches the formula. `lib/domain/coverage.ts` is pure and
 * has no I/O, so this needs no mocking and no database.
 *
 *   all-evidenced → 100 · all-absent → 0 · mixed → the number you'd compute
 */
import { computeCoverage, computeScore, scoreAnalysis, stillNotEvidenced } from "@/lib/domain/coverage";
import type { DomainBullet, DomainCoverageItem, DomainRequirement } from "@/lib/domain/types";

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

function check(label: string, actual: number, expected: number) {
  it(label, () => expect(actual).toBeCloseTo(expected, 2));
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
it("React evidenced by a bullet", () => expect(status("r1")).toBe("evidenced"));
it("Kubernetes nowhere in profile is absent", () => expect(status("r2")).toBe("absent"));
it("GraphQL listed but not demonstrated is partial", () => expect(status("r3")).toBe("partial"));

/* ---------------------------------------------- verdict wording, not probability */
it("the note never reads like a prediction (N4)", () => {
  const scored = scoreAnalysis(reqs3, [
    covered("a", "evidenced"),
    covered("b", "partial"),
    covered("c", "absent"),
    covered("d", "evidenced"),
  ]);
  expect(scored.note).not.toMatch(/\d+%|chance|likely to|will get/i);
});

it("stillNotEvidenced: required → preferred → implied, skill name over text, deduped", () => {
  expect(stillNotEvidenced([
    requirement("r1", "implied", "Writes docs"),
    requirement("r2", "preferred", "Terraform", "Terraform"),
    requirement("r3", "required", "Kubernetes at scale", "Kubernetes"),
    requirement("r4", "required", "Owns on-call rotation"),
    requirement("r5", "preferred", "k8s", "kubernetes"),
  ])).toEqual([
    { label: "Kubernetes", necessity: "required" },
    { label: "Owns on-call rotation", necessity: "required" },
    { label: "Terraform", necessity: "preferred" },
    { label: "Writes docs", necessity: "implied" },
  ]);
  expect(stillNotEvidenced([])).toEqual([]);
});

it("stillNotEvidenced: an empty skill name falls back to the text; a blank label is dropped", () => {
  expect(stillNotEvidenced([
    requirement("r1", "required", "Owns on-call rotation", ""),
    requirement("r2", "required", "  Terraform  ", "  "),
    requirement("r3", "preferred", "   ", "   "),
    requirement("r4", "preferred", "", null),
  ])).toEqual([
    { label: "Owns on-call rotation", necessity: "required" },
    { label: "Terraform", necessity: "required" },
  ]);
});

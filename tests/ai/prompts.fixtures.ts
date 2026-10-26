/**
 * One representative input per agent, shaped to reach every branch its
 * prompt builder has (gap vs. cited question, failing tests, no resources…).
 */
import type { DomainBullet, DomainRequirement } from "@/lib/domain/types";
import type { DrillTopic } from "@/lib/domain/drill";
import type { PostingReaderInput } from "@/lib/ai/agents/posting-reader";
import type { ProfileReaderInput } from "@/lib/ai/agents/profile-reader";
import type { DocumentTranscriberInput } from "@/lib/ai/agents/document-transcriber";
import type { BulletTailorInput } from "@/lib/ai/agents/bullet-tailor";
import type { SummaryTailorInput } from "@/lib/ai/agents/summary-tailor";
import type { QuestionWriterInput } from "@/lib/ai/agents/question-writer";
import type { AnswerWriterInput } from "@/lib/ai/agents/answer-writer";
import type { LearningPlannerInput } from "@/lib/ai/agents/learning-planner";
import type { RevisionWriterInput } from "@/lib/ai/agents/revision-writer";
import type { QuizWriterInput } from "@/lib/ai/agents/quiz-writer";
import type { ChallengeWriterInput } from "@/lib/ai/agents/challenge-writer";
import type { CodeReviewerInput } from "@/lib/ai/agents/code-reviewer";

const bullet = (id: string, text: string): DomainBullet => ({
  id,
  text,
  scope: "work",
  scopeRef: "work.0",
  skillNames: [],
  recencyMonths: 3,
});
const requirement = (id: string, text: string, necessity: DomainRequirement["necessity"] = "required"): DomainRequirement => ({
  id,
  kind: "hard_skill",
  text,
  necessity,
  mentionCount: 2,
  skillName: null,
  evidenceQuote: text,
});
const topics: DrillTopic[] = [
  { label: "React hooks", necessity: "required", status: "absent" },
  { label: "Postgres indexing", necessity: "preferred", status: "partial" },
  { label: "Code review", necessity: "implied", status: null },
];
const role = { title: "Senior Frontend Engineer", seniority: "Senior" };
const b1 = bullet("blt-1", "Built the checkout in React, cutting load time by 40%.");
const b2 = bullet("blt-2", "Ran weekly code review for a team of four.");

export const FIXTURES: {
  posting_reader: PostingReaderInput;
  profile_reader: ProfileReaderInput;
  profile_reader_plain: ProfileReaderInput;
  document_transcriber: DocumentTranscriberInput;
  bullet_tailor: BulletTailorInput;
  summary_tailor: SummaryTailorInput;
  question_writer: QuestionWriterInput;
  answer_writer: AnswerWriterInput;
  answer_writer_gap: AnswerWriterInput;
  learning_planner: LearningPlannerInput;
  learning_planner_nobudget: LearningPlannerInput;
  revision_cards: RevisionWriterInput;
  quiz_round: QuizWriterInput;
  coding_challenge: ChallengeWriterInput;
  code_review: CodeReviewerInput;
  code_review_untested: CodeReviewerInput;
} = {
  posting_reader: { text: "We need 5+ years of React. Email jobs@acme.test." },
  profile_reader: { text: "Jane Doe\nEngineer at Acme", previousFailure: null, correction: "Keep every bullet." },
  profile_reader_plain: { text: "Jane Doe\nEngineer at Acme", previousFailure: null },
  document_transcriber: { data: new Uint8Array([1, 2]), mediaType: "image/png", filename: "scan.png" },
  bullet_tailor: { jobTitle: "Frontend Engineer", bullet: b1, requirement: requirement("r1", "React at scale"), profileTerms: ["React"] },
  summary_tailor: { jobTitle: "Frontend Engineer", bullets: [b1.text, b2.text], profileTerms: ["React"] },
  question_writer: {
    jobTitle: "Frontend Engineer",
    company: "Acme",
    requirements: [requirement("r1", "React at scale"), requirement("r2", "GraphQL", "preferred")],
    bullets: [b1, b2],
    absentRequirements: [requirement("r2", "GraphQL", "preferred")],
  },
  answer_writer: {
    jobTitle: "Frontend Engineer",
    company: "Acme",
    seniority: "Senior",
    question: { type: "behavioural", text: "Tell me about a fast page.", whyTheyAsk: "Perf matters.", frame: ["Situation", "Result"] },
    evidenceBullets: [b1],
    otherBullets: [b2],
    requirementText: "React at scale",
  },
  answer_writer_gap: {
    jobTitle: "Frontend Engineer",
    company: "",
    seniority: null,
    question: { type: "gap", text: "Have you used GraphQL?", whyTheyAsk: "It is in the stack.", frame: [] },
    evidenceBullets: [],
    otherBullets: [b2],
    requirementText: null,
  },
  learning_planner: {
    jobTitle: "Frontend Engineer",
    matchedStrengths: ["React", "TypeScript"],
    budgetMin: 90,
    gaps: [
      {
        skillName: "GraphQL",
        evidence: "partial",
        requirementText: "GraphQL APIs",
        evidenceQuote: "Experience with GraphQL APIs",
        currentEvidence: "REST APIs at Acme",
        existingBullet: { id: "blt-1", text: b1.text },
        resources: [{ id: "c1", title: "GraphQL in 100s", author: "Fireship", entry: "0:00–1:40", durationMin: 2, summary: "the basics" }],
      },
      {
        skillName: "Kubernetes",
        evidence: "none",
        requirementText: "Kubernetes",
        evidenceQuote: "",
        currentEvidence: null,
        existingBullet: null,
        resources: [],
      },
    ],
  },
  learning_planner_nobudget: { jobTitle: "", matchedStrengths: [], budgetMin: null, gaps: [] },
  revision_cards: { role, topics, count: 6, minutes: 30 },
  quiz_round: { role: { title: "Backend Engineer", seniority: null }, topics, count: 5, difficulty: "medium" },
  coding_challenge: { role, topics, difficulty: "easy", language: "javascript" },
  code_review: {
    problem: {
      title: 'Two "Sum"',
      statement: "Return indices of two numbers adding to target.",
      signature: { functionName: "twoSum", params: [{ name: "nums", type: "int[]" }], returnType: "int[]" },
      optimalTime: "O(n)",
      optimalSpace: "O(n)",
    },
    language: "javascript",
    code: "function twoSum(nums, t) { return []; }",
    tests: { passed: 1, total: 3, failing: [{ passed: false, input: "[2,7], 9", expected: "[0,1]", actual: "[]" }] },
    secondsUsed: 610,
    minutes: 20,
  },
  code_review_untested: {
    problem: {
      title: "Two Sum",
      statement: "Return indices.",
      signature: { functionName: "twoSum", params: [{ name: "nums", type: "int[]" }], returnType: "int[]" },
      optimalTime: "O(n)",
      optimalSpace: "O(n)",
    },
    language: "python",
    code: "def two_sum(nums, t): return []",
    tests: null,
    secondsUsed: 60,
    minutes: 20,
  },
};

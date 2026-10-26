/**
 * Every system prompt is pinned byte for byte. A change here must come with a
 * PROMPT_VERSIONS bump (ai_runs.prompt_version is the axis a failure rate is
 * read on) and a new hash — and it invalidates OpenAI's cached prefix.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PROMPT_VERSIONS, SYSTEM } from "@/lib/ai/system-prompts";
import { SYSTEM_V2 } from "@/lib/ai/system-prompts/archive/v2";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const hashes = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, sha(v)]));

describe("system prompts", () => {
  it("SYSTEM is byte-identical to the pinned text", () => {
    expect(hashes(SYSTEM)).toEqual({
      extractProfile: "89ef9e5b543c19f838152209a5e6f7e56eabed7931d318dbdc600ac43faeda0f",
      transcribeDocument: "c2a15d0dd691f0421a557e26c1d7cf89758db1792853b63f820b775280f63e95",
      analyzeJd: "4a1587adedd740393de9e9ede971737a67db20066b8bbeb210bbef801acde6b3",
      tailorBullets: "86feae16a54026319c5f10ae0aed3f072b44a55a8959ddfb035659a93658ed21",
      tailorSummary: "e5bfdabaa995725f4b2fed2b9219440704c9bcd72f55adcaed9021d93a920e21",
      generateQuestions: "0b08317d4db1758d6adb815eb4c434555c7b2d8bda469d3f7dab5d32c58c354d",
      answerQuestion: "215ee3cef63cdf6b8f68123f02287c0311356c358744242116bdd060718ef93a",
      synthesisePlan: "a7b0d225a56c67c8f3c8470ee71de7fffcc13d28d68e1590254e96443703872a",
      revisionCards: "1b765cc63292976ecfda3473d7d04327c17eec98b1167f7ef6ae360dad190a75",
      quizRound: "f6e39990b34acf14a8e8b59b045613f4afb4f9dee2cba20b1b2c17dc9ac4a74d",
      codingChallenge: "498140f90eeacc885e36826152f798fac091b7417adfdac68b23824f9b751c02",
      codeReview: "38635a2b7906f1ead734690b4b20ae181dc30fc08bd075d860d8e854ee3df611",
    });
  });

  it("the archived v2 prompts are byte-identical", () => {
    expect(hashes(SYSTEM_V2)).toEqual({
      extractProfile: "8bc39818ede097dc4ada3b8cd1ddb4a790f0f05a1a9dc4b2faf7b628f497c8dd",
      analyzeJd: "9e91ef501bbfdbb60c5313dee574f6e84f63b5307759dc45d039c9b826262c0b",
      tailorBullets: "310696c9174d39cc8eb56caf9c8e7e97b16476f01bf5766a9ed2709799ea9366",
      tailorSummary: "38ab03730f6c545480218bcf3f5681477ce23baf999ad0874367824f85205731",
      generateQuestions: "84a1d78d54a0ffa0a3915a6d4d4cc85a32dbbf0cab41c4917dd8670fdca16f7d",
      answerQuestion: "b02aa11746403282df3e57229af4ad157ad85bf353ec89b4a39658e01b8813cc",
      synthesisePlan: "eb6f5e3aff122550f7e5394cb6d6af4b7a83d11f83e0553280a09ea4557010c5",
      revisionCards: "6bf705b088e5275c399ca840dfc3267b372df60e016100360f16cdff72cd749c",
      quizRound: "d08127d2f3474507f133e2a32792124b939e6f56c010d71cdd149d6e90d3cced",
      codingChallenge: "aa33bf8ccc2e46f7e2589a73472fdc70a7a87c6b0dcb79d94806cae610376ada",
      codeReview: "5a925044c6b3f8e7ae02f305ce23b6cd4ce1cb08a4341680af41087065d569a6",
    });
  });

  it("prompt versions are unchanged", () => {
    expect(PROMPT_VERSIONS).toEqual({
      extractProfile: "extract-profile@4",
      transcribeDocument: "transcribe-document@2",
      analyzeJd: "analyze-jd@4",
      tailorBullets: "tailor-bullets@4",
      tailorSummary: "tailor-summary@4",
      generateQuestions: "interview-questions@5",
      answerQuestion: "question-answer@4",
      synthesisePlan: "learning-plan@4",
      revisionCards: "revision-cards@3",
      quizRound: "quiz-round@3",
      codingChallenge: "coding-challenge@3",
      codeReview: "code-review@3",
    });
  });
});

/**
 * Every agent's assembled user message is pinned byte for byte. Moving a
 * builder, or refactoring one, must not change what the model reads: the
 * static half is OpenAI's cached prefix and the whole is what a prompt
 * version means.
 */
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { assemblePrompt } from "@/lib/ai/prompts/assemble";
import { postingReader } from "@/lib/ai/agents/posting-reader";
import { profileReader } from "@/lib/ai/agents/profile-reader";
import { documentTranscriber } from "@/lib/ai/agents/document-transcriber";
import { bulletTailor } from "@/lib/ai/agents/bullet-tailor";
import { summaryTailor } from "@/lib/ai/agents/summary-tailor";
import { questionWriter } from "@/lib/ai/agents/question-writer";
import { answerWriter } from "@/lib/ai/agents/answer-writer";
import { learningPlanner } from "@/lib/ai/agents/learning-planner";
import { revisionWriter } from "@/lib/ai/agents/revision-writer";
import { quizWriter } from "@/lib/ai/agents/quiz-writer";
import { challengeWriter } from "@/lib/ai/agents/challenge-writer";
import { codeReviewer } from "@/lib/ai/agents/code-reviewer";
import { FIXTURES as F } from "./prompts.fixtures";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const assembled: Record<string, string> = {
  posting_reader: assemblePrompt(postingReader, F.posting_reader),
  profile_reader: assemblePrompt(profileReader, F.profile_reader),
  profile_reader_plain: assemblePrompt(profileReader, F.profile_reader_plain),
  document_transcriber: assemblePrompt(documentTranscriber, F.document_transcriber),
  bullet_tailor: assemblePrompt(bulletTailor, F.bullet_tailor),
  summary_tailor: assemblePrompt(summaryTailor, F.summary_tailor),
  question_writer: assemblePrompt(questionWriter, F.question_writer),
  answer_writer: assemblePrompt(answerWriter, F.answer_writer),
  answer_writer_gap: assemblePrompt(answerWriter, F.answer_writer_gap),
  learning_planner: assemblePrompt(learningPlanner, F.learning_planner),
  learning_planner_nobudget: assemblePrompt(learningPlanner, F.learning_planner_nobudget),
  revision_cards: assemblePrompt(revisionWriter, F.revision_cards),
  quiz_round: assemblePrompt(quizWriter, F.quiz_round),
  coding_challenge: assemblePrompt(challengeWriter, F.coding_challenge),
  code_review: assemblePrompt(codeReviewer, F.code_review),
  code_review_untested: assemblePrompt(codeReviewer, F.code_review_untested),
};

const PINNED: Record<string, string> = {
  answer_writer: "22a6dc8af18f1351e5f21841454c964d6a1978034baa51c559b01aeb6694db07",
  answer_writer_gap: "b91a7e0a22a8455a4b03daaee94d6773827b3130a32a7354faaf96d1f00e0f2d",
  bullet_tailor: "708753d706c3d70d2573f61843c7dd7de8beed4b93e4d1a5a4869692d2e9c379",
  code_review: "8f02a04b175794eb8e90cc54bad2ba0ad524f60823bd3dcb68e605b2876476b1",
  code_review_untested: "9b4b1d3c37ef19316f127b8c5fa3e9e5d791b6288f8de00110322291604f681b",
  coding_challenge: "a49659404cbbc4479e95ae55d0d6e845fb4ce035afeb6cb31682a0fddad60874",
  document_transcriber: "e25bde2c12576b24c7165392d9f0bb68204a65a05fb6242e6dc4ab1ce7ab739b",
  learning_planner: "ab69276ba91f52920b60d3abf72cdfc0cc8971ded1df6e040e497ad806afac6a",
  learning_planner_nobudget: "bb6fd735555f64729f329a665b9d564c89c5ea644b9ebf3f2b3f6b9730a50466",
  posting_reader: "8006639f4f2db2b095fda4732035b11227807b423c3b10866c8a62742bd180e3",
  profile_reader: "9d6a17ec14cf60146c2cc15c30ad1e5c1598be4ba9522a8c2db20ea32cb84545",
  profile_reader_plain: "727f9648afd4bd7393b3be4a27a01b70f34ace81570dba4fdcbc4205a66a3e90",
  question_writer: "e827ec950557e2e4708d47c4c03b66094ca099e3e1b73a5575aa3acbd9c3eb65",
  quiz_round: "1fc300485df073fe3cf09622155d5ddd4c3a5b4c7b836daa2a0dc0572777429f",
  revision_cards: "9e21e56b6e5a7b82244d14dcc5a44f29e331d58b503d604481a90cac9cfdf732",
  summary_tailor: "e63fbb246d69ad4f0af271da5cc22eab9a9f4a8fdf6b3205837520b0c5823616",
};

it("every agent's assembled prompt is byte-identical to the pinned text", () => {
  expect(Object.fromEntries(Object.entries(assembled).map(([k, v]) => [k, sha(v)]))).toEqual(PINNED);
});

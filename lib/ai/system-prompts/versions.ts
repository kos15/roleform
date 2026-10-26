/**
 * One version per system prompt. A text change bumps the version here so
 * `ai_runs.prompt_version` stays a usable axis when a failure rate moves.
 */
export const PROMPT_VERSIONS = {
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
} as const;

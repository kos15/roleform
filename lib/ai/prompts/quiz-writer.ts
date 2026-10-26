import type { QuizWriterInput } from "../agents/quiz-writer";
import { SECONDS_PER_QUESTION } from "@/lib/domain/drill";
import { roleLine, topicBlock } from "./drill";

export function staticContext(i: QuizWriterInput): string {
  return roleLine(i.role);
}

export function dynamicContext(i: QuizWriterInput): string {
  return [
    `Write exactly ${i.count} questions, mostly ${i.difficulty}. Time limit: ${SECONDS_PER_QUESTION[i.difficulty]} seconds each.`,
    topicBlock(i.topics),
  ].join("\n");
}

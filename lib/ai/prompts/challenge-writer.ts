import type { ChallengeWriterInput } from "../agents/challenge-writer";
import { LANGUAGE_LABEL } from "@/lib/domain/drill";
import { roleLine, topicBlock } from "./drill";

export function staticContext(i: ChallengeWriterInput): string {
  return roleLine(i.role);
}

export function dynamicContext(i: ChallengeWriterInput): string {
  return [`Difficulty: ${i.difficulty}. Language for \`solution\`: ${LANGUAGE_LABEL[i.language]}.`, topicBlock(i.topics)].join("\n");
}

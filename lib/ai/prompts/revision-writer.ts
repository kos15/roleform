import type { RevisionWriterInput } from "../agents/revision-writer";
import { roleLine, topicBlock } from "./drill";

export function staticContext(i: RevisionWriterInput): string {
  return roleLine(i.role);
}

export function dynamicContext(i: RevisionWriterInput): string {
  return [`Time to revise: ${i.minutes} minutes. Write exactly ${i.count} cards.`, topicBlock(i.topics)].join("\n");
}

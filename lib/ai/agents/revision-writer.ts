import "server-only";
import { revisionDeckSchema } from "../schemas/drill";
import { PROMPT_VERSIONS, SYSTEM } from "../prompts";
import type { DrillTopic } from "@/lib/domain/drill";
import { defineAgent } from "./define";
import { enumOf, roleLine, topicBlock, type DrillRole } from "./drill-prompt";

export interface RevisionWriterInput {
  role: DrillRole;
  topics: DrillTopic[];
  count: number;
  minutes: number;
}

/**
 * §3 on the cards: they teach the subject and say nothing about the person.
 * A card that tells the user what they "have done" is a claim with no source.
 */
const SECOND_PERSON_CLAIM =
  /\b(your (experience|résumé|resume|background|previous role|last role|team at)|you (have|'ve) (led|built|shipped|worked|managed|used)|in your role)\b/i;

/** RevisionWriter — a deck of revision cards over the posting's topics (F26). */
export const revisionWriter = defineAgent({
  name: "revision_cards",
  promptVersion: PROMPT_VERSIONS.revisionCards,
  model: "writer-fast",
  schema: (i: RevisionWriterInput) => revisionDeckSchema(enumOf(i.topics), i.count),
  system: SYSTEM.revisionCards,
  staticContext: (i) => roleLine(i.role),
  dynamicContext: (i) =>
    [`Time to revise: ${i.minutes} minutes. Write exactly ${i.count} cards.`, topicBlock(i.topics)].join("\n"),
  reasoningEffort: "low",
  maxOutputTokens: (i) => (300 + i.count * 230) * 2,
  retries: 1,
  inputGuards: ["pii"],
  // Prep scope: odds and comparison banned; teaching about weaknesses is not.
  outputGuards: ["no_urls", "tone_prep"],
  verify: (value, i) => {
    const claim = value.cards.find((c) => SECOND_PERSON_CLAIM.test([c.answer, c.pitfall, ...c.keyPoints].join(" ")));
    if (claim) {
      return `Card "${claim.title}" talks about the candidate's own experience. Cards teach the subject only; rewrite it without mentioning the candidate.`;
    }
    const topicSet = new Set(i.topics.map((t) => t.label));
    const covered = new Set(value.cards.map((c) => c.topic));
    const missing = [...topicSet].filter((t) => !covered.has(t));
    if (missing.length > 0 && i.count >= topicSet.size) {
      return `No card covers: ${missing.join("; ")}. Every topic needs at least one card.`;
    }
    const titles = value.cards.map((c) => c.title.toLowerCase().trim());
    if (new Set(titles).size !== titles.length) return "Two cards share a title. Each card covers a distinct concept.";
    return null;
  },
});

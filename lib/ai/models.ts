import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

/**
 * Model tiers (specs §10). Provider-agnostic by design: swapping providers is
 * one import change here, which is why the AI SDK was chosen over calling a
 * provider API directly.
 *
 * Cost target is <$0.35 per full analysis (specs §11) — `ai_runs` makes the
 * real number observable from day one rather than assumed.
 */

export type Tier = "strong" | "mid";

export const MODELS: Record<Tier, string> = {
  strong: "claude-opus-5",
  mid: "claude-sonnet-5",
};

export function modelFor(tier: Tier): LanguageModel {
  return anthropic(MODELS[tier]);
}

/** Low for extraction, moderate for tailoring and question phrasing (specs §10). */
export const TEMPERATURE = {
  extraction: 0,
  analysis: 0.1,
  tailoring: 0.4,
  questions: 0.5,
} as const;

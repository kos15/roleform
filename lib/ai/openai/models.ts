import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/**
 * Model roles (specs §10; docs/superpowers/specs/2026-10-21-agent-architecture-design.md).
 *
 * Writers are GPT-5 reasoning models; the checker is TypeSafe's Jev, called
 * through lib/ai/typesafe/jev.ts rather than the AI SDK. Every model id lives
 * here and nowhere else.
 *
 * Cost target is <$0.35 per full analysis (specs §11) — `ai_runs` makes the
 * real number observable rather than assumed. Reasoning tokens arrive as
 * output tokens and are metered like any other (owner decision, 2026-10-21).
 */

export type ModelRole = "writer" | "writer-fast" | "checker";
export type WriterRole = Exclude<ModelRole, "checker">;

export const MODELS: Record<ModelRole, string> = {
  writer: "gpt-5",
  "writer-fast": "gpt-5-mini",
  // TypeSafe's alias for its current Jev release. Confirm against
  // `GET https://api.typesafe.ai/v1/models` when the key is provisioned.
  checker: "jev-latest",
};

export function modelFor(role: WriterRole): LanguageModel {
  return openai(MODELS[role]);
}

/**
 * GPT-5 models reason before answering and reject a custom `temperature`, so
 * an agent declares how hard to think instead. Low effort for extraction and
 * rephrasing, medium where the model has to reconcile a whole document.
 */
export type ReasoningEffort = "minimal" | "low" | "medium";

/**
 * Provider options for one call. `promptCacheKey` routes requests for the same
 * agent and prompt version to the same cache, so the static prefix every
 * agent puts first is actually reused (OpenAI caches identical prefixes past
 * ~1,024 tokens).
 */
export function openaiOptions(effort: ReasoningEffort, cacheKey: string) {
  return { openai: { reasoningEffort: effort, promptCacheKey: cacheKey } };
}

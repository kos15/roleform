import "server-only";
import { profileEnhanceSchema } from "../schemas/profile-enhance";
import { PROMPT_VERSIONS, SYSTEM } from "../system-prompts";
import { ENHANCE_PURPOSE, type EnhanceField } from "@/lib/domain/enhance";
import { defineAgent } from "./define";
import * as prompt from "../prompts/profile-enhancer";

export interface ProfileEnhancerInput {
  /** The member's own content fields — never `basics` contact or location (N7). */
  fields: EnhanceField[];
}

/**
 * ProfileEnhancer — rephrase, tidy or remove the member's own profile lines (F34).
 * No checker: a deterministic filter in lib/domain/enhance.ts drops anything
 * that adds a claim, and the member ticks every change.
 */
export const profileEnhancer = defineAgent({
  name: ENHANCE_PURPOSE,
  promptVersion: PROMPT_VERSIONS.enhanceProfile,
  model: "writer-fast",
  schema: (i: ProfileEnhancerInput) => profileEnhanceSchema(i.fields),
  system: SYSTEM.enhanceProfile,
  dynamicContext: prompt.dynamicContext,
  reasoningEffort: "low",
  maxOutputTokens: 6_000,
  timeoutMs: 45_000,
  retries: 1,
  inputGuards: ["pii", "injection_regex"],
  outputGuards: ["no_urls", "tone"],
});

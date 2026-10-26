import "server-only";
import { DraftResumeSchema } from "../schemas/resume-json";
import { PROMPT_VERSIONS, SYSTEM } from "../system-prompts";
import type { ModelFailure } from "@/lib/domain/types";
import { defineAgent } from "./define";
import * as prompt from "../prompts/profile-reader";

export interface ProfileReaderInput {
  /** Cleaned and clamped résumé text. */
  text: string;
  previousFailure: ModelFailure | null;
  correction?: string;
}

/**
 * Output is the résumé re-emitted as JSON: roughly the input's tokens plus the
 * JSON's keys, then doubled for GPT-5's reasoning tokens until Task 8 of the
 * agent plan measures the real ceiling.
 */
function ceilingFor(chars: number, previous: ModelFailure | null): number {
  const base = Math.min(12_000, Math.max(4_000, Math.ceil(chars / 3) + 1_500));
  const answer = previous === "truncated" ? Math.min(16_000, Math.ceil(base * 1.6)) : base;
  return answer * 2;
}

/**
 * ProfileReader — raw résumé text → a DRAFT JSON Resume (F1). Nothing it
 * returns reaches the profile until the member confirms it (N3). No `pii`
 * guard: transcribing contact details is this agent's job (guardrails IN-4
 * scope note), and this is the one time they reach a provider.
 */
export const profileReader = defineAgent({
  name: "extract_profile",
  promptVersion: PROMPT_VERSIONS.extractProfile,
  model: "writer",
  schema: DraftResumeSchema,
  system: SYSTEM.extractProfile,
  staticContext: prompt.staticContext,
  dynamicContext: prompt.dynamicContext,
  reasoningEffort: "medium",
  maxOutputTokens: (i) => ceilingFor(i.text.length, i.previousFailure),
  // Long résumés take a while; well inside the route's maxDuration.
  timeoutMs: 150_000,
  // Attempts are driven by the client (EXTRACT_ATTEMPTS), so the count on
  // screen is the count billed — no hidden retries here.
  retries: 0,
  inputGuards: ["injection_regex", "injection_jev"],
  documentKind: "resume",
  outputGuards: [],
  verify: (value) => {
    const roles = value.work.filter((w) => w.name.trim() || w.position.trim());
    const total = value.work.reduce((n, w) => n + w.highlights.filter((h) => h.trim()).length, 0);
    if (roles.length > 0 && total === 0) {
      return "Every role came back with zero highlights. Transcribe the bullets under each employer.";
    }
    return null;
  },
});

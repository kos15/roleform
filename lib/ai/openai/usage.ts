/**
 * Token usage across every attempt of one call. PURE.
 *
 * A corrective retry or a checker-driven rewrite is a real call the member's
 * meter must see (owner decision: everything consumed counts), so `ai_runs`
 * records the sum, not the last attempt. Cached input is clamped to input so
 * the `ai_runs_cached_input_check` constraint can never fail a member's run.
 */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

export function sumUsage(attempts: Usage[]): Usage {
  const input = attempts.reduce((n, a) => n + a.inputTokens, 0);
  const output = attempts.reduce((n, a) => n + a.outputTokens, 0);
  const cached = attempts.reduce((n, a) => n + a.cachedInputTokens, 0);
  return { inputTokens: input, outputTokens: output, cachedInputTokens: Math.min(cached, input) };
}

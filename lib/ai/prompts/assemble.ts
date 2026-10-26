/**
 * Prompt assembly for agents. PURE.
 *
 * Static first, the run's data last (agent design §6.6). OpenAI reuses a
 * prompt's identical prefix from cache, so everything that does not change
 * between calls — rules, the posting shared by every bullet of one run — must
 * come before anything that does. The separator is a fixed string so the
 * prefix ends at the same byte for every call of an agent.
 */
export const PROMPT_SEPARATOR = "\n\n## This run\n";

export function assemblePrompt<I>(
  def: { staticContext?: (input: I) => string; dynamicContext: (input: I) => string },
  input: I,
): string {
  const head = def.staticContext ? def.staticContext(input) : "";
  return `${head}${PROMPT_SEPARATOR}${def.dynamicContext(input)}`;
}

/**
 * The agent layer's pure decisions, checked by hand (CLAUDE.md §11 — not a
 * test suite). Each block names the production change that would break it.
 *
 *   pnpm check:agents
 */
import assert from "node:assert/strict";
import { MODELS, openaiOptions } from "../lib/ai/models";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("models");
check("writers are GPT-5", () => {
  assert.equal(MODELS.writer, "gpt-5");
  assert.equal(MODELS["writer-fast"], "gpt-5-mini");
});
check("provider options carry reasoning effort and the cache key, no temperature", () => {
  assert.deepEqual(openaiOptions("low", "tailor_bullet@v7"), {
    openai: { reasoningEffort: "low", promptCacheKey: "tailor_bullet@v7" },
  });
});

console.log(`ok — ${passed} checks`);

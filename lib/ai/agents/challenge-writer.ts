import "server-only";
import { generatedChallengeSchema, type StoredChallenge } from "../schemas/drill";
import { PROMPT_VERSIONS, SYSTEM } from "../system-prompts";
import { LANGUAGE_LABEL, parseTestCase, type CodeLanguage, type Difficulty, type DrillTopic, type Signature } from "@/lib/domain/drill";
import { loadSandbox, runJsCasesSync } from "@/lib/drill/sandbox";
import { defineAgent } from "./define";
import { enumOf, roleLine, topicBlock, type DrillRole } from "./drill-prompt";

export interface ChallengeWriterInput {
  role: DrillRole;
  topics: DrillTopic[];
  difficulty: Difficulty;
  language: CodeLanguage;
}

/** Below this many self-consistent tests a generated problem is not worth serving. */
export const MIN_VERIFIED_TESTS = 4;

/** Runs every generated test against the model's own reference solution in QuickJS. */
export async function verifiedTests(value: StoredChallenge) {
  const sig: Signature = { functionName: value.functionName, params: value.params, returnType: value.returnType };
  const parsed = value.tests
    .map((t) => ({ t, c: parseTestCase(t, sig) }))
    .filter((x): x is { t: (typeof value.tests)[number]; c: NonNullable<ReturnType<typeof parseTestCase>> } => x.c !== null);
  const results = runJsCasesSync(await loadSandbox(), value.referenceJs, value.functionName, parsed.map((p) => p.c));
  return {
    keep: parsed.filter((_, n) => results[n]?.passed).map((p) => p.t),
    malformed: value.tests.length - parsed.length,
    failed: results.filter((r) => !r.passed),
  };
}

/**
 * ChallengeWriter — one coding problem with hidden tests (F26). Its verify is
 * the strongest in the product: every test is executed against the model's
 * reference solution before a member ever sees it.
 */
export const challengeWriter = defineAgent({
  name: "coding_challenge",
  promptVersion: PROMPT_VERSIONS.codingChallenge,
  model: "writer-fast",
  schema: (i: ChallengeWriterInput) => generatedChallengeSchema(enumOf(i.topics)),
  system: SYSTEM.codingChallenge,
  staticContext: (i) => roleLine(i.role),
  dynamicContext: (i) =>
    [`Difficulty: ${i.difficulty}. Language for \`solution\`: ${LANGUAGE_LABEL[i.language]}.`, topicBlock(i.topics)].join("\n"),
  reasoningEffort: "low",
  maxOutputTokens: 9_600,
  retries: 1,
  inputGuards: ["pii"],
  outputGuards: ["no_urls", "tone_prep"],
  verify: async (value) => {
    const names = value.params.map((p) => p.name);
    if (new Set(names).size !== names.length) return "Two parameters share a name.";
    const { keep, malformed, failed } = await verifiedTests(value);
    if (keep.length < MIN_VERIFIED_TESTS) {
      const detail = failed
        .slice(0, 3)
        .map((f) => `args ${f.input}: referenceJs returned ${f.actual}, test expects ${f.expected}`)
        .join("; ");
      return (
        `Only ${keep.length} of ${value.tests.length} tests agree with referenceJs` +
        (malformed ? ` (${malformed} do not match the parameter types)` : "") +
        `. ${detail}. Fix referenceJs or the expected values so every test is what referenceJs returns.`
      );
    }
    return null;
  },
});

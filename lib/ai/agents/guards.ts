/**
 * The guard catalogue agents declare from (agent design §6.7). PURE.
 *
 * Every rule lives in lib/domain/guardrails.ts; this file only decides which
 * rules an agent runs and in what form. An agent lists its guards in its
 * definition and `runAgent` applies them, so a guard cannot be forgotten at a
 * call site the way it could when each caller wired its own.
 *
 * `injection_jev` is declared here but applied by runAgent, because it is a
 * model call (lib/ai/typesafe/injection.ts) and this file has no I/O.
 */
import {
  JD_MAX_CHARS,
  findUrls,
  redactPii,
  scanForInjection,
  scanProtected,
  scanTone,
} from "@/lib/domain/guardrails";

export type GuardId =
  | "size"
  | "injection_regex"
  | "injection_jev"
  | "pii"
  | "protected"
  | "no_urls"
  | "tone"
  | "tone_prep";

export interface GuardedInput {
  text: string;
  /** Guard and pattern names only — never matched text (N7). */
  flags: string[];
}

/**
 * Input guards, cheapest first. Only `size` and `pii` change the text; the
 * scans flag. A flagged injection still runs (guardrails.md IN-5: output
 * containment is the real defence), and the protected-attribute scan only
 * flags here — excluding the offending requirement is the pipeline's job,
 * per requirement, and rewriting a whole posting would hide that.
 */
export function applyInputGuards(text: string, guards: GuardId[]): GuardedInput {
  let out = text;
  const flags: string[] = [];
  if (guards.includes("size") && out.length > JD_MAX_CHARS) {
    out = out.slice(0, JD_MAX_CHARS);
    flags.push("size:truncated");
  }
  if (guards.includes("pii")) out = redactPii(out);
  if (guards.includes("injection_regex")) {
    for (const p of scanForInjection(out).patterns) flags.push(`injection:${p}`);
  }
  if (guards.includes("protected")) {
    const scan = scanProtected(out);
    if (scan.blocked) flags.push(`protected:${scan.category}`);
  }
  return { text: out, flags };
}

/** Every string a model wrote, joined, so prose checks see the whole output. */
function proseOf(value: unknown): string {
  const parts: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
  return parts.join("\n");
}

/**
 * Output guards. Returns the correction to send back to the model, or null.
 * The correction names the rule, never the offending text.
 */
export function outputGuardProblem(value: unknown, guards: GuardId[]): string | null {
  if (guards.includes("no_urls") && findUrls(value).length > 0) {
    return "Remove every link you wrote. Never write a URL — every real link in this product comes from the curated catalog or a provider's own field.";
  }
  const scope = guards.includes("tone") ? "full" : guards.includes("tone_prep") ? "prep" : null;
  if (scope) {
    const tone = scanTone(proseOf(value), scope);
    if (!tone.ok) {
      return `Rewrite without ${tone.violations.join(", ")} language: never state odds, never compare the member to other candidates${scope === "full" ? ", never call a gap a weakness or deficiency" : ""}.`;
    }
  }
  return null;
}

/**
 * What the Jev injection check reads. Always redacted: spotting instructions
 * aimed at an AI needs the prose, never a name, email or phone — and the
 * owner cleared bullets and drafts for TypeSafe, not contact details. The
 * writer itself (ProfileReader) still gets the original text.
 */
export function injectionCheckText(text: string): string {
  return redactPii(text);
}

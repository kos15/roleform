/**
 * The eval harness (agent design §6.8, §7). Run by hand at a gate — not CI
 * (CLAUDE.md §11).
 *
 *   pnpm eval <agent> [--set <name>] [--arm gpt5|gpt5+jev] [--role writer|writer-fast] [--dry]
 *
 * --dry validates the fixture set offline (shape and count) and calls nothing.
 * A live run needs OPENAI_API_KEY and DATABASE_URL (every call writes an
 * ai_runs row under EVAL_CLERK_USER_ID); the gpt5+jev arm also needs
 * TYPESAFE_API_KEY. The gpt5 arm unsets that key in-process, so the checkers
 * skip exactly as they do in production when TypeSafe is unreachable.
 *
 * --role overrides the agent's model for this process only (the script never
 * touches the app's configuration), so a cheaper model can be judged on the
 * same fixtures before the agent definition is changed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SETS, type AgentKey } from "./fixtures";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

/** `--role writer|writer-fast`, or undefined when absent. Throws on anything else. */
export function parseRole(argv: readonly string[]): "writer" | "writer-fast" | undefined {
  const i = argv.indexOf("--role");
  if (i < 0) return undefined;
  const value = argv[i + 1];
  if (value !== "writer" && value !== "writer-fast") throw new Error("--role must be writer or writer-fast");
  return value;
}

export function loadSet(agent: AgentKey, set: string): unknown[] {
  const spec = (SETS[agent] as Record<string, { schema: { parse: (v: unknown) => unknown }; min: number }>)[set];
  if (!spec) throw new Error(`No set "${set}" for ${agent}. Sets: ${Object.keys(SETS[agent]).join(", ")}`);
  const raw = JSON.parse(readFileSync(join(__dirname, "fixtures", agent, `${set}.json`), "utf8")) as unknown[];
  const cases = raw.map((c) => spec.schema.parse(c));
  if (cases.length < spec.min) throw new Error(`${agent}/${set} has ${cases.length} cases; the design asks for ${spec.min}.`);
  const ids = new Set(cases.map((c) => (c as { id: string }).id));
  if (ids.size !== cases.length) throw new Error(`${agent}/${set} repeats a case id.`);
  return cases;
}

async function main() {
  const agent = process.argv[2] as AgentKey | undefined;
  if (!agent || !(agent in SETS)) {
    console.error(`Usage: pnpm eval <${Object.keys(SETS).join("|")}> [--set name] [--arm gpt5|gpt5+jev] [--role writer|writer-fast] [--dry]`);
    process.exit(2);
  }
  const role = parseRole(process.argv);
  const sets = arg("set") ? [arg("set")!] : Object.keys(SETS[agent]);
  for (const set of sets) {
    const cases = loadSet(agent, set);
    console.log(`✓ ${agent}/${set}: ${cases.length} cases valid`);
  }
  if (process.argv.includes("--dry")) return;

  const arm = arg("arm") ?? "gpt5+jev";
  if (arm === "gpt5") delete process.env.TYPESAFE_API_KEY;
  const { runLive } = await import("./live");
  for (const set of sets) await runLive(agent, set, loadSet(agent, set), arm, role);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

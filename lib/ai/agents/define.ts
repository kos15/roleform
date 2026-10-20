import "server-only";
import type { z } from "zod";
import { runStructured, type RunOptions, type RunOutcome } from "../run";
import type { ReasoningEffort } from "../models";
import type { Checker } from "../checkers/types";
import type { Result } from "@/lib/domain/types";
import { PROMPT_SEPARATOR } from "./prompt";
import { applyInputGuards, outputGuardProblem, type GuardId } from "./guards";

/**
 * One agent per AI task (agent design §6.1).
 *
 * An agent is a fixed job with a typed contract: what it reads, the schema it
 * must return, how hard it may think, how many tokens it may spend, which
 * guards run on the way in and out, and — where its output makes claims about
 * the member — a checker. Agents do not choose their own next step; the
 * pipeline and the actions call them in a fixed order.
 */
export interface AgentDef<I, S extends z.ZodType> {
  /** Recorded as `ai_runs.purpose`. Stable across prompt versions. */
  name: string;
  promptVersion: string;
  model: "writer" | "writer-fast";
  schema: S;
  system: string;
  /** Rules and context shared by every call of this agent in a run — cached. */
  staticContext?: (input: I) => string;
  /** This call's own data. Input guards apply to this part only. */
  dynamicContext: (input: I) => string;
  reasoningEffort: ReasoningEffort;
  maxOutputTokens: number;
  timeoutMs?: number;
  /** Corrective retries for schema, output-guard and verify failures. */
  retries: number;
  inputGuards: GuardId[];
  outputGuards: GuardId[];
  /** A rule the schema cannot express. Return the correction, or null. */
  verify?: (value: z.infer<S>, input: I) => string | null | Promise<string | null>;
  checker?: Checker<I, z.infer<S>>;
  files?: (input: I) => RunOptions<S>["files"];
}

/** Identity — exists so TypeScript infers `I` and `S` from the literal. */
export function defineAgent<I, S extends z.ZodType>(def: AgentDef<I, S>): AgentDef<I, S> {
  return def;
}

export interface AgentContext {
  clerkUserId: string;
  analysisId?: string;
}

export async function runAgent<I, S extends z.ZodType>(
  agent: AgentDef<I, S>,
  input: I,
  ctx: AgentContext,
): Promise<Result<RunOutcome<z.infer<S>>>> {
  const guarded = applyInputGuards(agent.dynamicContext(input), agent.inputGuards);
  // Names and counts only — the flagged text is member or posting content (N7).
  if (guarded.flags.length > 0) console.warn(`[agent] ${agent.name} input flags: ${guarded.flags.join(",")}`);

  const head = agent.staticContext ? agent.staticContext(input) : "";

  return runStructured({
    purpose: agent.name,
    promptVersion: agent.promptVersion,
    model: agent.model,
    schema: agent.schema,
    system: agent.system,
    prompt: `${head}${PROMPT_SEPARATOR}${guarded.text}`,
    reasoningEffort: agent.reasoningEffort,
    cacheKey: `${agent.name}@${agent.promptVersion}`,
    clerkUserId: ctx.clerkUserId,
    analysisId: ctx.analysisId,
    maxOutputTokens: agent.maxOutputTokens,
    timeoutMs: agent.timeoutMs,
    retries: agent.retries,
    files: agent.files?.(input),
    verify: async (value) => {
      const guardProblem = outputGuardProblem(value, agent.outputGuards);
      if (guardProblem) return guardProblem;
      return (await agent.verify?.(value, input)) ?? null;
    },
  });
}

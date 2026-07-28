import "server-only";
import { generateObject, NoObjectGeneratedError } from "ai";
import type { z } from "zod";
import { db } from "@/lib/db";
import { aiRuns } from "@/lib/db/schema";
import { modelFor, MODELS, type Tier } from "./models";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/**
 * The single door every LLM call goes through (N6).
 *
 * Never JSON.parse a raw completion anywhere in this codebase — `generateObject`
 * plus a Zod schema is the only sanctioned path across the boundary.
 *
 * Every call writes an `ai_runs` row so cost and schema-failure rate are
 * observable from day one, and no prompt or document text is ever logged (N7).
 */

export interface RunOptions<S extends z.ZodType> {
  purpose: string;
  promptVersion: string;
  tier: Tier;
  schema: S;
  system: string;
  prompt: string;
  temperature: number;
  clerkUserId: string;
  analysisId?: string;
  /** Corrective retries on schema failure. specs §10 sets these per purpose. */
  retries: number;
  /**
   * Rejects a schema-valid object that violates a rule the schema can't express
   * (an invented bullet id, a fabricated metric). Returning a string triggers a
   * corrective retry carrying that string back to the model.
   */
  verify?: (value: z.infer<S>) => string | null;
}

export interface RunOutcome<T> {
  value: T;
  aiRunId: string;
  retryCount: number;
}

export async function runStructured<S extends z.ZodType>(
  opts: RunOptions<S>,
): Promise<Result<RunOutcome<z.infer<S>>>> {
  const startedAt = Date.now();
  let retryCount = 0;
  let correction: string | null = null;
  let lastFailure = "";

  while (retryCount <= opts.retries) {
    try {
      // The schema is widened to z.ZodType for the call itself: inferring
      // SCHEMA = S here while `verify` also references z.infer<S> makes the
      // inference circular. The cast below restores the precise type.
      const result = await generateObject({
        model: modelFor(opts.tier),
        schema: opts.schema as z.ZodType,
        system: opts.system,
        prompt: correction ? `${opts.prompt}\n\n## Correction required\n${correction}` : opts.prompt,
        temperature: opts.temperature,
      });

      const object = result.object as z.infer<S>;
      const problem: string | null = opts.verify?.(object) ?? null;
      if (problem) {
        lastFailure = problem;
        correction = problem;
        retryCount++;
        continue;
      }

      const aiRunId = await recordRun(opts, {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        latencyMs: Date.now() - startedAt,
        schemaValid: true,
        retryCount,
      });

      return ok({ value: object, aiRunId, retryCount });
    } catch (e) {
      // NoObjectGeneratedError means the model could not satisfy the schema.
      lastFailure = NoObjectGeneratedError.isInstance(e)
        ? "the previous response did not satisfy the required schema"
        : e instanceof Error
          ? e.message
          : "unknown model error";
      correction = "Your previous response did not satisfy the schema. Return valid output only.";
      retryCount++;
    }
  }

  await recordRun(opts, {
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: Date.now() - startedAt,
    schemaValid: false,
    retryCount,
  });

  return err(
    appError(
      "schema_invalid",
      "The model could not produce a valid result for this step.",
      // Failure reasons are structural, never document content (N7).
      lastFailure.slice(0, 200),
    ),
  );
}

async function recordRun<S extends z.ZodType>(
  opts: RunOptions<S>,
  metrics: {
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    schemaValid: boolean;
    retryCount: number;
  },
): Promise<string> {
  const [row] = await db
    .insert(aiRuns)
    .values({
      clerkUserId: opts.clerkUserId,
      analysisId: opts.analysisId ?? null,
      purpose: opts.purpose,
      model: MODELS[opts.tier],
      promptVersion: opts.promptVersion,
      ...metrics,
    })
    .returning({ id: aiRuns.id });
  return row.id;
}

import "server-only";
import { APICallError, generateObject, NoObjectGeneratedError, RetryError } from "ai";
import type { z } from "zod";
import { db } from "@/lib/db";
import { modelFor, MODELS, openaiOptions, type ReasoningEffort, type WriterRole } from "./models";
import { appError, err, ok, type ModelFailure, type Result } from "@/lib/domain/types";
import type { CheckVerdict } from "./checkers/types";
import { decideAfterCheck } from "./checkers/loop";
import { correctionFor } from "./checkers/verdict";
import { sumUsage, type Usage } from "./usage";

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
  model: WriterRole;
  schema: S;
  system: string;
  prompt: string;
  /** GPT-5 takes no temperature; it takes how hard to reason. */
  reasoningEffort: ReasoningEffort;
  /** Routes same-agent requests to the same prompt cache. Defaults to `purpose@promptVersion`. */
  cacheKey?: string;
  clerkUserId: string;
  analysisId?: string;
  /**
   * PR-3 / learning-engine invariant I6: every call declares a ceiling. No
   * open-ended generation anywhere in this codebase — a response cut by the
   * ceiling fails schema like any other malformed output and takes its one
   * corrective retry, rather than the model quietly running long and the run
   * paying for tokens nobody asked for.
   */
  maxOutputTokens: number;
  /** Corrective retries on schema failure. specs §10 sets these per purpose. */
  retries: number;
  /**
   * Per-attempt wall clock. A request that hangs past this is aborted and
   * reported as `transient` rather than holding the function until the
   * platform kills it with no message at all.
   */
  timeoutMs?: number;
  /**
   * Images or PDFs sent alongside the prompt (the OCR pass). Bytes go to the
   * provider and nowhere else — never logged, never stored on `ai_runs` (N7).
   */
  files?: Array<{ data: Uint8Array; mediaType: string; filename?: string }>;
  /**
   * Rejects a schema-valid object that violates a rule the schema can't express
   * (an invented bullet id, a fabricated metric). Returning a string triggers a
   * corrective retry carrying that string back to the model.
   */
  verify?: (value: z.infer<S>) => string | null | Promise<string | null>;
  /**
   * The Jev checker, after `verify` passes (agent design §6.3). A flagged
   * output gets `checkerRetries` rewrites — a budget separate from `retries`
   * — then fails with `failure: "checker"` and `checkerRejectMessage`.
   */
  check?: (value: z.infer<S>) => Promise<CheckVerdict>;
  checkerRetries?: number;
  checkerRejectMessage?: string;
}

export interface RunOutcome<T> {
  value: T;
  aiRunId: string;
  retryCount: number;
  /** What this call actually burned, on the attempt that succeeded (GR-5). */
  inputTokens: number;
  outputTokens: number;
  /** The part of `inputTokens` served from the provider's prompt cache. */
  cachedInputTokens: number;
}

/**
 * Transient provider failures (429, 5xx, timeouts) are retried by the SDK
 * itself with exponential backoff before they ever reach us. They are NOT
 * corrective retries: re-asking the model with "your output was invalid" when
 * the output never arrived wastes a call and mislabels the failure.
 */
const TRANSIENT_SDK_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 120_000;

export async function runStructured<S extends z.ZodType>(
  opts: RunOptions<S>,
): Promise<Result<RunOutcome<z.infer<S>>>> {
  const startedAt = Date.now();
  let retryCount = 0;
  let correction: string | null = null;
  let lastFailure = "";
  let lastKind: ModelFailure = "schema";
  let checkerRetriesLeft = opts.checkerRetries ?? 0;
  // Every attempt that came back is a call the member's meter must see — the
  // row records the sum, not the last attempt (owner: everything consumed counts).
  const attempts: Usage[] = [];

  while (retryCount <= opts.retries) {
    try {
      const text = correction ? `${opts.prompt}\n\n## Correction required\n${correction}` : opts.prompt;
      const content = opts.files?.length
        ? {
            messages: [
              {
                role: "user" as const,
                content: [
                  { type: "text" as const, text },
                  ...opts.files.map((f) =>
                    f.mediaType.startsWith("image/")
                      ? { type: "image" as const, image: f.data, mediaType: f.mediaType }
                      : { type: "file" as const, data: f.data, mediaType: f.mediaType, filename: f.filename },
                  ),
                ],
              },
            ],
          }
        : { prompt: text };

      // The schema is widened to z.ZodType for the call itself: inferring
      // SCHEMA = S here while `verify` also references z.infer<S> makes the
      // inference circular. The cast below restores the precise type.
      const result = await generateObject({
        model: modelFor(opts.model),
        schema: opts.schema as z.ZodType,
        instructions: opts.system,
        ...content,
        providerOptions: openaiOptions(opts.reasoningEffort, opts.cacheKey ?? `${opts.purpose}@${opts.promptVersion}`),
        maxOutputTokens: opts.maxOutputTokens,
        maxRetries: TRANSIENT_SDK_RETRIES,
        abortSignal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });

      const object = result.object as z.infer<S>;
      attempts.push({
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        cachedInputTokens: result.usage.inputTokenDetails?.cacheReadTokens ?? 0,
      });
      const problem: string | null = (await opts.verify?.(object)) ?? null;
      if (problem) {
        lastFailure = problem;
        lastKind = "verify";
        correction = problem;
        retryCount++;
        continue;
      }

      if (opts.check) {
        const verdict = await opts.check(object);
        const decision = decideAfterCheck({ verdict, checkerRetriesLeft });
        if (decision === "revise") {
          // Its own budget: `retryCount` is untouched, so a run that spent its
          // guard retry still gets this one rewrite.
          checkerRetriesLeft--;
          correction = correctionFor(verdict);
          lastKind = "checker";
          lastFailure = `checker flagged ${verdict.kind}`;
          continue;
        }
        if (decision === "fallback") {
          await recordRun(opts, {
            ...sumUsage(attempts),
            latencyMs: Date.now() - startedAt,
            schemaValid: true,
            retryCount,
          });
          return err({
            ...appError(
              "model_failed",
              opts.checkerRejectMessage ?? "We couldn't write this without overstating your experience. Try again.",
              `checker flagged ${verdict.kind}`,
            ),
            failure: "checker",
          });
        }
      }

      const { inputTokens, outputTokens, cachedInputTokens } = sumUsage(attempts);

      const aiRunId = await recordRun(opts, {
        inputTokens,
        outputTokens,
        cachedInputTokens,
        latencyMs: Date.now() - startedAt,
        schemaValid: true,
        retryCount,
      });

      return ok({ value: object, aiRunId, retryCount, inputTokens, outputTokens, cachedInputTokens });
    } catch (thrown) {
      // After a retry the SDK wraps the error; unwrap a non-retryable one so it
      // is classified as what it is.
      const e =
        RetryError.isInstance(thrown) && thrown.reason === "errorNotRetryable" ? thrown.lastError : thrown;
      // A rejected request is our bug, not the model's: a malformed schema, a
      // bad key, an unknown model. Rewording the prompt cannot fix it, so burn
      // no retries — fail once, loudly, carrying the provider's own reason.
      if (APICallError.isInstance(e) && !e.isRetryable) {
        await recordRun(opts, {
          ...sumUsage(attempts),
          latencyMs: Date.now() - startedAt,
          schemaValid: false,
          retryCount,
        });
        return err({
          ...appError(
            "model_failed",
            "The model provider rejected this request.",
            // Provider messages describe our schema and parameters, never the
            // document — safe to carry, still truncated (N7).
            e.message.slice(0, 200),
          ),
          failure: "rejected",
        });
      }

      // Still failing after the SDK's own backoff, or our timeout fired. The
      // output never arrived, so there is nothing to correct: stop here and
      // let the caller decide whether to try again later.
      if (isTransient(e)) {
        await recordRun(opts, {
          ...sumUsage(attempts),
          latencyMs: Date.now() - startedAt,
          schemaValid: false,
          retryCount,
        });
        return err({
          ...appError(
            "model_failed",
            "The AI service is busy or timed out. Try again in a moment.",
            e instanceof Error ? e.name : "transient",
          ),
          failure: "transient",
        });
      }

      // NoObjectGeneratedError means the model could not satisfy the schema —
      // or ran out of room before it finished.
      const truncated = NoObjectGeneratedError.isInstance(e) && e.finishReason === "length";
      lastKind = truncated ? "truncated" : "schema";
      lastFailure = truncated
        ? "the previous response hit the output ceiling and was cut off"
        : NoObjectGeneratedError.isInstance(e)
          ? "the previous response did not satisfy the required schema"
          : e instanceof Error
            ? e.message
            : "unknown model error";
      correction = truncated
        ? "Your previous response was cut off by the length limit. Stay within every word limit and add nothing outside the fields."
        : "Your previous response did not satisfy the schema. Return valid output only.";
      retryCount++;
    }
  }

  await recordRun(opts, {
    ...sumUsage(attempts),
    latencyMs: Date.now() - startedAt,
    schemaValid: false,
    retryCount,
  });

  return err({
    ...appError(
      "schema_invalid",
      "The model could not produce a valid result for this step.",
      // Failure reasons are structural, never document content (N7).
      lastFailure.slice(0, 200),
    ),
    failure: lastKind,
  });
}

function isTransient(e: unknown): boolean {
  if (APICallError.isInstance(e)) return e.isRetryable;
  if (!(e instanceof Error)) return false;
  if (e.name === "AbortError" || e.name === "TimeoutError") return true;
  // Exhausted backoff arrives as RetryError; fetch reports a dropped
  // connection as a TypeError.
  if (RetryError.isInstance(e)) return e.reason !== "errorNotRetryable";
  return e.name === "TypeError" && /fetch|network|socket|ECONN/i.test(e.message);
}

async function recordRun<S extends z.ZodType>(
  opts: RunOptions<S>,
  metrics: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
    latencyMs: number;
    schemaValid: boolean;
    retryCount: number;
  },
): Promise<string> {
  const row = await db.aiRun.create({
    data: {
      clerkUserId: opts.clerkUserId,
      analysisId: opts.analysisId ?? null,
      purpose: opts.purpose,
      model: MODELS[opts.model],
      promptVersion: opts.promptVersion,
      ...metrics,
    },
    select: { id: true },
  });
  return row.id;
}

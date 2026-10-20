import "server-only";
import { db } from "@/lib/db";
import { featureEnabled } from "@/lib/features";
import { MODELS } from "../models";
import { JevResponseSchema, type JevResponse, type SystemOneRequest } from "./requests";

/**
 * The one door to TypeSafe's System One API (Jev).
 *
 * Plain `fetch` + Zod, no SDK — the same call the Razorpay integration makes
 * (CLAUDE.md §8): one authenticated POST is not worth a dependency to audit
 * and pin. Server-only: the key never reaches a client bundle.
 *
 * Every failure returns null and the caller fails open (agent design §6.4):
 * no key, the `ai_checkers` switch off, a timeout, a non-2xx, or an answer
 * that does not parse. The deterministic guards already ship; a checker that
 * cannot run is no regression, and a résumé run must not die for it.
 *
 * One `ai_runs` row per call, success or not — counts and model only, never
 * the state or the answers (N7).
 */
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const TIMEOUT_MS = 2_000;

export async function jevAsk(args: {
  purpose: string;
  request: Omit<SystemOneRequest, "model">;
  clerkUserId: string;
  analysisId?: string;
}): Promise<JevResponse | null> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return null;
  if (!(await featureEnabled("ai_checkers"))) return null;

  const startedAt = Date.now();
  let parsed: JevResponse | null = null;
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: MODELS.checker, ...args.request }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) {
      const result = JevResponseSchema.safeParse(await response.json());
      if (result.success) parsed = result.data;
      // A shape we don't recognise would otherwise turn every checker into a
      // silent no-op. Status and purpose only — never the state or answer (N7).
      else console.warn(`[jev] ${args.purpose} unparseable response (${result.error.issues.length} issues)`);
    } else {
      console.warn(`[jev] ${args.purpose} HTTP ${response.status}`);
    }
  } catch (e) {
    // Timeout or network — fail open, recorded below.
    console.warn(`[jev] ${args.purpose} ${e instanceof Error ? e.name : "error"}`);
  }

  await db.aiRun
    .create({
      data: {
        clerkUserId: args.clerkUserId,
        analysisId: args.analysisId ?? null,
        purpose: args.purpose,
        model: parsed?.model ?? MODELS.checker,
        promptVersion: `${args.purpose}@1`,
        inputTokens: parsed?.usage?.input_tokens ?? 0,
        outputTokens: parsed?.usage?.output_tokens ?? 0,
        latencyMs: Date.now() - startedAt,
        schemaValid: parsed !== null,
        retryCount: 0,
      },
    })
    .catch(() => {
      // A metering write must never fail the check it measured.
    });

  return parsed;
}

/** The Noul probability for a question, or null when the answer is missing or the wrong type. */
export function noulOf(response: JevResponse, name: string): number | null {
  const a = response.answers[name];
  return a && a.type === "noul" ? a.noul : null;
}

export function choiceOf(response: JevResponse, name: string): string | null {
  const a = response.answers[name];
  return a && a.type === "choice" ? a.choice : null;
}

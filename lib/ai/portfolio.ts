import "server-only";
import { runStructured } from "./run";
import { PortfolioSiteSchema, type PortfolioChoices } from "./schemas/portfolio";
import { PROMPT_VERSIONS, SYSTEM } from "./prompts";
import { TEMPERATURE } from "./models";
import {
  allowedLinks,
  buildRequestText,
  checkPortfolioHtml,
  materialsText,
  type PortfolioMaterials,
} from "@/lib/domain/portfolio";
import type { Result } from "@/lib/domain/types";

/**
 * F28 — the one in-app portfolio build. One strong-tier call.
 *
 * The page goes to strangers under the member's name, so the guardrail is the
 * same shape as tailoring's: a schema, then `checkPortfolioHtml` as `verify`
 * (only profile links, nothing loaded or sent, no figure the source lacks),
 * with one corrective retry carrying exactly what to fix.
 */
export async function buildPortfolioSite(args: {
  clerkUserId: string;
  analysisId: string;
  materials: PortfolioMaterials;
  choices: PortfolioChoices;
}): Promise<Result<{ html: string; aiRunId: string }>> {
  const nowYear = new Date().getFullYear();
  const allowed = allowedLinks(args.materials, args.choices);
  // Everything the member told us. Their own notes count as source: the brief
  // asks for project detail the résumé lacks.
  const sourceText = [
    materialsText(args.materials, args.choices),
    args.choices.projectNotes,
    args.choices.emphasis,
  ].join("\n");

  const outcome = await runStructured({
    purpose: "portfolio_site",
    promptVersion: PROMPT_VERSIONS.portfolioSite,
    tier: "strong",
    schema: PortfolioSiteSchema,
    system: SYSTEM.portfolioSite,
    prompt: buildRequestText(args.materials, args.choices, nowYear),
    temperature: TEMPERATURE.portfolio,
    clerkUserId: args.clerkUserId,
    analysisId: args.analysisId,
    // A full single-file page is ~6–10K tokens of HTML and CSS.
    maxOutputTokens: 14_000,
    timeoutMs: 240_000,
    retries: 1,
    verify: (value) => checkPortfolioHtml(value.html, { allowed, sourceText, nowYear }),
  });
  if (!outcome.ok) return outcome;
  return { ok: true, value: { html: outcome.value.value.html, aiRunId: outcome.value.aiRunId } };
}

/**
 * The live half of the eval harness: calls the same public functions the app
 * calls, then reads cost and latency back from `ai_runs` — the numbers the
 * gate is judged on (agent design §7). Imported only on a non-dry run.
 */
import "../env";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../../lib/db";
import { tailorBullet, tailorSummary, type TailoredResult } from "../../lib/ai/tailor";
import { generateAnswer } from "../../lib/ai/answer";
import { analyzeJd } from "../../lib/ai/analyze-jd";
import { extractProfile } from "../../lib/ai/extract-profile";
import { checkFabrication } from "../../lib/domain/fabrication";
import type { DomainBullet, DomainRequirement } from "../../lib/domain/types";
import type { AgentKey } from "./fixtures";

const USER = process.env.EVAL_CLERK_USER_ID ?? "eval-user";
const ANALYSIS = process.env.EVAL_ANALYSIS_ID;

const bulletOf = (text: string): DomainBullet => ({
  id: crypto.randomUUID(),
  text,
  scope: "work",
  scopeRef: "work.0",
  skillNames: [],
  recencyMonths: 12,
});
const requirementOf = (text: string): DomainRequirement => ({
  id: crypto.randomUUID(),
  kind: "hard_skill",
  text,
  necessity: "required",
  mentionCount: 3,
  skillName: null,
  evidenceQuote: text,
});

type CaseResult = Record<string, unknown> & { id: string };

async function runCase(agent: AgentKey, c: Record<string, any>): Promise<CaseResult> {
  switch (agent) {
    case "bullet-tailor": {
      const r = await tailorBullet({
        clerkUserId: USER,
        analysisId: ANALYSIS!,
        bullet: bulletOf(c.bullet),
        requirement: requirementOf(c.requirement),
        profileTerms: c.profileTerms,
        jobTitle: "Senior Engineer",
      });
      if (!r.ok) return { id: c.id, error: r.error.code };
      const findings = checkFabrication({ source: c.bullet, rewritten: r.value.rewrittenText, profileTerms: c.profileTerms });
      return {
        id: c.id,
        expect: c.expect,
        source: c.bullet,
        rewritten: r.value.rewrittenText,
        transform: r.value.transform,
        blockedBy: r.value.blockedBy,
        checkerFallback: r.value.blockedBy.includes("checker"),
        fabricationsInOutput: findings.map((f) => `${f.kind}:${f.token}`),
      };
    }
    case "summary-tailor": {
      const tailored = (c.bullets as string[]).map(
        (text): TailoredResult => ({
          sourceBulletId: crypto.randomUUID(),
          originalText: text,
          rewrittenText: text,
          transform: "verbatim",
          targetsRequirementId: null,
          aiRunId: null,
          blockedBy: [],
          tokensUsed: 0,
        }),
      );
      const r = await tailorSummary({ clerkUserId: USER, analysisId: ANALYSIS!, jobTitle: c.jobTitle, tailored, profileTerms: c.profileTerms });
      return r.ok ? { id: c.id, summary: r.value.summary, professionalSummary: r.value.professionalSummary, stock: !r.value.aiRunId } : { id: c.id, error: r.error.code };
    }
    case "answer-writer": {
      const r = await generateAnswer({
        clerkUserId: USER,
        analysisId: ANALYSIS!,
        jobTitle: c.jobTitle,
        company: "",
        seniority: null,
        question: c.question,
        evidenceBullets: (c.evidence as string[]).map(bulletOf),
        otherBullets: (c.other as string[]).map(bulletOf),
        requirementText: c.requirementText,
      });
      return r.ok
        ? { id: c.id, type: c.question.type, headline: r.value.answer.headline, hooks: r.value.answer.resumeHooks.length }
        : { id: c.id, type: c.question.type, error: r.error.code, failure: r.error.failure ?? null, message: r.error.message };
    }
    case "posting-reader": {
      const r = await analyzeJd({ clerkUserId: USER, analysisId: ANALYSIS!, rawText: c.text });
      return r.ok ? { id: c.id, requirements: r.value.analysis.requirements.length, isJobPosting: r.value.analysis.meta.isJobPosting } : { id: c.id, error: r.error.code };
    }
    case "profile-reader": {
      const r = await extractProfile({ clerkUserId: USER, rawText: c.text, attempt: 1, previousFailure: null, readFromImage: false });
      return r.ok ? { id: c.id, roles: r.value.result.resume.work.length } : { id: c.id, error: r.error.code };
    }
  }
}

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${Math.round((n / d) * 100)}%`;
}
function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

export async function runLive(agent: AgentKey, set: string, cases: unknown[], arm: string) {
  if (!ANALYSIS && agent !== "profile-reader") {
    throw new Error("Set EVAL_ANALYSIS_ID to an analysis you own — ai_runs rows reference it.");
  }
  const startedAt = new Date();
  const results: CaseResult[] = [];
  for (const c of cases as Record<string, any>[]) {
    results.push(await runCase(agent, c));
    process.stdout.write(".");
  }
  console.log();

  const runs = await db.aiRun.findMany({
    where: { clerkUserId: USER, createdAt: { gte: startedAt } },
    select: { purpose: true, model: true, inputTokens: true, cachedInputTokens: true, outputTokens: true, latencyMs: true, schemaValid: true },
  });
  const byPurpose = new Map<string, typeof runs>();
  for (const r of runs) byPurpose.set(r.purpose, [...(byPurpose.get(r.purpose) ?? []), r]);
  const metrics = [...byPurpose].map(([purpose, rows]) => ({
    purpose,
    model: rows[0]?.model,
    calls: rows.length,
    schemaValid: pct(rows.filter((r) => r.schemaValid).length, rows.length),
    p50ms: quantile(rows.map((r) => r.latencyMs), 0.5),
    p95ms: quantile(rows.map((r) => r.latencyMs), 0.95),
    inputTokens: rows.reduce((n, r) => n + r.inputTokens, 0),
    cachedInputTokens: rows.reduce((n, r) => n + r.cachedInputTokens, 0),
    outputTokens: rows.reduce((n, r) => n + r.outputTokens, 0),
  }));
  console.table(metrics);

  if (agent === "bullet-tailor") {
    const leaks = results.filter((r) => (r.fabricationsInOutput as string[] | undefined)?.length);
    const honest = results.filter((r) => r.expect === "pass");
    const falseFallbacks = honest.filter((r) => r.checkerFallback);
    console.log(`fabrications reaching output (deterministic recheck): ${leaks.length}`);
    if (honest.length) console.log(`honest rewrites the checker sent to verbatim (false positives): ${falseFallbacks.length}/${honest.length}`);
    for (const r of results) console.log(`\n${r.id} [${r.transform}${(r.blockedBy as string[]).length ? ` · ${(r.blockedBy as string[]).join(",")}` : ""}]\n  source:    ${r.source}\n  rewritten: ${r.rewritten}`);
    console.log("\nRead every pair above: a regex cannot see 'led' where the source said 'contributed to'.");
  } else {
    for (const r of results) console.log(JSON.stringify(r));
  }

  const dir = join(__dirname, "reports");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${agent}-${set}-${arm}-${startedAt.toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ agent, set, arm, startedAt, metrics, results }, null, 2));
  console.log(`\nreport: ${file}`);
}

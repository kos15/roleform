import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  analyses,
  coverageItems,
  interviewQuestions,
  jdRequirements,
  resumeDrafts,
  skillGaps,
  skills,
  tailoredBullets,
} from "@/lib/db/schema";
import { analyzeJd } from "@/lib/ai/analyze-jd";
import { tailorBullet, tailorSummary, type TailoredResult } from "@/lib/ai/tailor";
import { generateQuestions } from "@/lib/ai/interview";
import { describeGaps } from "@/lib/ai/gaps";
import { computeCoverage, scoreAnalysis } from "@/lib/domain/coverage";
import { orderSkills, rankBullets } from "@/lib/domain/ordering";
import { summariseChanges } from "@/lib/domain/diff";
import { canonicalSkill, skillsIn } from "@/lib/catalog/skills";
import { TEMPLATES, ratingFor } from "@/lib/render/templates";
import { getBullets, toDomainBullets } from "@/lib/db/queries/profile";
import { getProfileById } from "@/lib/db/queries/analysis";
import { progressFor, type StageEmitter } from "./stages";
import type { DomainBullet, DomainRequirement } from "@/lib/domain/types";
import type { StoredResume } from "@/lib/ai/schemas/resume-json";

/**
 * The analysis pipeline (specs §8).
 *
 *   ① analyze-jd     → JdMeta + jd_requirements
 *   ② coverage       → coverage_items + score            [PURE, no LLM]
 *   ③ tailor         → 6 × resume_drafts + tailored_bullets
 *   ④ interview      → 10 × interview_questions
 *   ⑤ gaps + courses → skill_gaps + deterministic match
 *
 * Degradation rule (specs §11): a failure on one surface degrades THAT tab and
 * nothing else. A failed Prep generation must never lose the résumés — so
 * stages ③–⑤ each catch their own failure, mark themselves degraded, and let
 * the run finish. Only stages ① and ② can fail the whole analysis, because
 * without requirements there is nothing to show at all.
 */
export async function runAnalysis(args: {
  clerkUserId: string;
  analysisId: string;
  emit: StageEmitter;
}): Promise<void> {
  const { clerkUserId, analysisId, emit } = args;

  const [analysis] = await db
    .select()
    .from(analyses)
    .where(and(eq(analyses.clerkUserId, clerkUserId), eq(analyses.id, analysisId)));
  if (!analysis) throw new Error("analysis not found");

  const profile = await getProfileById(clerkUserId, analysis.profileId);
  if (!profile) throw new Error("profile not found");

  const resume = profile.resumeJson as StoredResume;
  const bulletRows = await getBullets(clerkUserId, profile.id);
  const bullets = toDomainBullets(bulletRows);

  // specs §13: a profile with zero bullets blocks analysis. The tool has
  // nothing to work from, and saying so beats inventing something.
  if (bullets.length === 0) {
    await fail(analysisId, "Your profile has no experience bullets yet.");
    emit({ stage: "reading", state: "failed", progressPct: 0, message: "Your profile has no experience bullets yet." });
    return;
  }

  const profileTerms = [
    ...resume.skills.map((s) => s.name),
    ...resume.skills.flatMap((s) => s.keywords),
    ...bullets.flatMap((b) => b.skillNames),
  ];

  /* ---------------------------------------------------- ① reading the posting */

  emit({ stage: "reading", state: "running", progressPct: progressFor("reading", "running") });

  const jd = await analyzeJd({ clerkUserId, analysisId, rawText: analysis.rawText });
  if (!jd.ok) {
    await fail(analysisId, jd.error.message);
    emit({ stage: "reading", state: "failed", progressPct: 0, message: jd.error.message });
    return;
  }

  const { meta, requirements: parsed } = jd.value.analysis;

  if (meta.language !== "en") {
    const message = "This posting isn't in English. Roleform handles English postings in v1.";
    await fail(analysisId, message);
    emit({ stage: "reading", state: "failed", progressPct: 0, message });
    return;
  }
  if (!meta.isJobPosting) {
    const message = "This document doesn't read like a job posting, so we stopped rather than guess.";
    await fail(analysisId, message);
    emit({ stage: "reading", state: "failed", progressPct: 0, message });
    return;
  }

  const skillIdByName = await resolveSkillIds(parsed.map((r) => r.skillName));

  const requirementRows = await db
    .insert(jdRequirements)
    .values(
      parsed.map((r) => ({
        clerkUserId,
        analysisId,
        kind: r.kind,
        text: r.text,
        necessity: r.necessity,
        mentionCount: r.mentionCount,
        evidenceQuote: r.evidenceQuote,
        skillId: skillIdByName.get(canonicalSkill(r.skillName) ?? "") ?? null,
      })),
    )
    .returning();

  const requirements: DomainRequirement[] = requirementRows.map((row, i) => ({
    id: row.id,
    kind: row.kind,
    text: row.text,
    necessity: row.necessity,
    mentionCount: row.mentionCount,
    evidenceQuote: row.evidenceQuote,
    skillName: canonicalSkill(parsed[i].skillName),
  }));

  await db
    .update(analyses)
    .set({
      company: meta.company || null,
      title: meta.title || null,
      location: meta.location || null,
      seniority: meta.seniority,
      employmentType: meta.employmentType,
      stageState: { usedRegions: jd.value.analysis.usedRegions, truncated: jd.value.truncated },
    })
    .where(eq(analyses.id, analysisId));

  emit({ stage: "reading", state: "done", progressPct: progressFor("reading", "done") });

  /* ------------------------------------- ② coverage + score — PURE, no LLM */

  emit({ stage: "matching", state: "running", progressPct: progressFor("matching", "running") });

  const profileSkillNames = resume.skills.map((s) => s.name);
  const coverage = computeCoverage(requirements, bullets, profileSkillNames);
  const scored = scoreAnalysis(requirements, coverage);

  await db.insert(coverageItems).values(
    coverage.map((c) => ({
      clerkUserId,
      analysisId,
      requirementId: c.requirementId,
      status: c.status,
      evidenceBulletIds: c.evidenceBulletIds,
      rationale: c.rationale,
    })),
  );

  await db
    .update(analyses)
    .set({
      score: scored.score.toFixed(2),
      scoreVerdict: scored.verdict,
      scoreNote: scored.note,
    })
    .where(eq(analyses.id, analysisId));

  emit({ stage: "matching", state: "done", progressPct: progressFor("matching", "done") });

  /* -------------------------------------------------------------- ③ tailoring */

  emit({ stage: "rewriting", state: "running", progressPct: progressFor("rewriting", "running") });

  let tailored: TailoredResult[] = [];
  let summaryLine = "";
  let professionalSummary = "";

  try {
    const ranked = rankBullets(bullets, requirements, coverage);
    const requirementById = new Map(requirements.map((r) => [r.id, r]));

    // One call per bullet, each scoped to its single best-matching requirement.
    // Sequential rather than parallel: the per-user rate limit matters more here
    // than latency, and the pipeline already streams progress.
    for (const entry of ranked) {
      const target = entry.requirementIds
        .map((id) => requirementById.get(id))
        .filter((r): r is DomainRequirement => Boolean(r))
        .sort((a, b) => weight(b) - weight(a))[0];

      const result = await tailorBullet({
        clerkUserId,
        analysisId,
        bullet: entry.bullet,
        requirement: target ?? null,
        profileTerms,
        jobTitle: meta.title,
      });
      if (result.ok) tailored.push(result.value);
    }

    const summary = await tailorSummary({
      clerkUserId,
      analysisId,
      jobTitle: meta.title,
      tailored,
      profileTerms,
    });
    if (summary.ok) {
      summaryLine = summary.value.summary;
      professionalSummary = summary.value.professionalSummary;
    }

    await writeDrafts({
      clerkUserId,
      analysisId,
      resume,
      requirements,
      profileSkillNames,
      tailored,
      professionalSummary,
      summaryLine,
      absent: scored.buckets.absent,
    });

    emit({ stage: "rewriting", state: "done", progressPct: progressFor("rewriting", "done") });
  } catch (e) {
    // The résumés degrade; Prep and Learning still run below.
    emit({
      stage: "rewriting",
      state: "degraded",
      progressPct: progressFor("rewriting", "done"),
      message: "We couldn't finish the drafts. Your analysis and the other tabs are unaffected.",
    });
    logStageFailure("rewriting", e);
  }

  /* ------------------------------------------------- ④ + ⑤ prep and learning */

  emit({ stage: "preparing", state: "running", progressPct: progressFor("preparing", "running") });

  let prepDegraded = false;
  try {
    await writeQuestions({
      clerkUserId,
      analysisId,
      meta: { title: meta.title, company: meta.company },
      requirements,
      bullets,
      absent: scored.buckets.absent,
    });
  } catch (e) {
    prepDegraded = true;
    logStageFailure("prep", e);
  }

  let learningDegraded = false;
  try {
    await writeGaps({
      clerkUserId,
      analysisId,
      jobTitle: meta.title,
      requirements,
      coverage,
      bullets,
      skillIdByName,
    });
  } catch (e) {
    learningDegraded = true;
    logStageFailure("learning", e);
  }

  await db.update(analyses).set({ status: "ready" }).where(eq(analyses.id, analysisId));

  emit({
    stage: "preparing",
    state: prepDegraded || learningDegraded ? "degraded" : "done",
    progressPct: 100,
    message:
      prepDegraded && learningDegraded
        ? "Prep and Learning didn't generate. Your résumés and match are ready."
        : prepDegraded
          ? "Prep didn't generate. Everything else is ready."
          : learningDegraded
            ? "Learning didn't generate. Everything else is ready."
            : undefined,
  });
}

/* ------------------------------------------------------------------ helpers */

function weight(r: DomainRequirement): number {
  return (r.necessity === "required" ? 3 : r.necessity === "preferred" ? 2 : 1) * r.mentionCount;
}

async function fail(analysisId: string, message: string) {
  // specs §13: keep the completed stages, mark the run failed. Resume, not restart.
  await db
    .update(analyses)
    .set({ status: "failed", scoreNote: message })
    .where(eq(analyses.id, analysisId));
}

/** N7: log the stage and the error shape, never the document. */
function logStageFailure(stage: string, e: unknown) {
  console.error(`[pipeline] stage=${stage} error=${e instanceof Error ? e.name : "unknown"}`);
}

async function resolveSkillIds(names: string[]): Promise<Map<string, string>> {
  const canonical = [...new Set(names.map((n) => canonicalSkill(n)).filter((n): n is string => Boolean(n)))];
  if (canonical.length === 0) return new Map();
  const rows = await db.select({ id: skills.id, name: skills.name }).from(skills);
  return new Map(rows.filter((r) => canonical.includes(r.name)).map((r) => [r.name, r.id]));
}

/**
 * Six drafts from ONE tailored set (M4.4).
 *
 * The drafts differ in template and in ordering, not in claims — six independent
 * rewrites of the same fact would produce six subtly different versions of the
 * user's history, which is exactly what the spine exists to prevent.
 */
async function writeDrafts(args: {
  clerkUserId: string;
  analysisId: string;
  resume: StoredResume;
  requirements: DomainRequirement[];
  profileSkillNames: string[];
  tailored: TailoredResult[];
  professionalSummary: string;
  summaryLine: string;
  absent: DomainRequirement[];
}) {
  const orderedSkills = orderSkills(args.profileSkillNames, args.requirements);
  const changes = buildChangeList(args.tailored);
  const missing = args.absent.map((r) => r.skillName ?? r.text).slice(0, 8);

  for (const template of TEMPLATES) {
    const [draft] = await db
      .insert(resumeDrafts)
      .values({
        clerkUserId: args.clerkUserId,
        analysisId: args.analysisId,
        templateId: template.id,
        resumeJson: {
          ...args.resume,
          basics: { ...args.resume.basics, summary: args.professionalSummary || args.resume.basics.summary },
          x_roleform: args.resume.x_roleform,
          x_orderedSkills: orderedSkills,
        },
        // N5: computed from structural rules, never hand-assigned.
        atsRating: ratingFor(template.id),
        pageCount: estimatePages(args.tailored.length),
        changes: [args.summaryLine, ...changes].filter(Boolean).slice(0, 8),
        missing,
      })
      .returning({ id: resumeDrafts.id });

    const rows = args.tailored.map((t, i) => ({
      clerkUserId: args.clerkUserId,
      draftId: draft.id,
      // N1: NOT NULL. Nothing reaches this table without provenance.
      sourceBulletId: t.sourceBulletId,
      originalText: t.originalText,
      rewrittenText: t.rewrittenText,
      transform: t.transform,
      targetsRequirementId: t.targetsRequirementId,
      aiRunId: t.aiRunId || null,
      ordinal: i,
    }));
    if (rows.length > 0) await db.insert(tailoredBullets).values(rows);
  }
}

function buildChangeList(tailored: TailoredResult[]): string[] {
  const changed = tailored.filter((t) => t.transform !== "verbatim" && t.transform !== "omit");
  const blocked = tailored.filter((t) => t.blockedBy.length > 0);
  const out = [summariseChanges(tailored.map((t) => ({ original: t.originalText, rewritten: t.rewrittenText })))];
  if (changed.length > 0) {
    out.push(`Bullets reordered to lead with what the posting asks for most often.`);
  }
  if (blocked.length > 0) {
    // Surfaced deliberately: the guard firing is information, not an internal detail.
    out.push(`${blocked.length} rewrite(s) were rejected for adding detail you hadn't stated, and kept verbatim.`);
  }
  return out;
}

function estimatePages(bulletCount: number): number {
  return bulletCount > 22 ? 2 : 1;
}

async function writeQuestions(args: {
  clerkUserId: string;
  analysisId: string;
  meta: { title: string; company: string };
  requirements: DomainRequirement[];
  bullets: DomainBullet[];
  absent: DomainRequirement[];
}) {
  const result = await generateQuestions({
    clerkUserId: args.clerkUserId,
    analysisId: args.analysisId,
    jobTitle: args.meta.title,
    company: args.meta.company,
    requirements: args.requirements,
    bullets: args.bullets,
    absentRequirements: args.absent,
  });
  if (!result.ok) throw new Error(result.error.code);

  const byText = new Map(args.requirements.map((r) => [r.text, r.id]));
  const rows = result.value.questions.map((q, i) => ({
    clerkUserId: args.clerkUserId,
    analysisId: args.analysisId,
    ordinal: i,
    type: q.type,
    text: q.text,
    likely: q.likely,
    whyTheyAsk: q.whyTheyAsk,
    frame: q.frame,
    evidenceBulletIds: q.evidenceBulletIds,
    sourceRequirementId: byText.get(q.sourceRequirementText) ?? null,
  }));
  if (rows.length > 0) await db.insert(interviewQuestions).values(rows);
}

async function writeGaps(args: {
  clerkUserId: string;
  analysisId: string;
  jobTitle: string;
  requirements: DomainRequirement[];
  coverage: Array<{ requirementId: string; status: string }>;
  bullets: DomainBullet[];
  skillIdByName: Map<string, string>;
}) {
  const statusById = new Map(args.coverage.map((c) => [c.requirementId, c.status]));

  // Gaps come from the PURE coverage pass, ordered by mention_count. The model
  // never chooses what the user is missing.
  const gapRequirements = args.requirements
    .filter((r) => statusById.get(r.id) !== "evidenced")
    .filter((r) => r.skillName && args.skillIdByName.has(r.skillName))
    .sort((a, b) => b.mentionCount - a.mentionCount);

  const seen = new Set<string>();
  const unique = gapRequirements.filter((r) => {
    if (seen.has(r.skillName!)) return false;
    seen.add(r.skillName!);
    return true;
  });

  // specs §13: fewer than 4 gaps shows what exists. Never pad the tab.
  if (unique.length === 0) return;

  const described = await describeGaps({
    clerkUserId: args.clerkUserId,
    analysisId: args.analysisId,
    jobTitle: args.jobTitle,
    gaps: unique.map((r) => ({
      skillName: r.skillName!,
      requirementText: r.text,
      mentionCount: r.mentionCount,
    })),
    bullets: args.bullets,
  });

  const noteBySkill = new Map(
    described.ok ? described.value.gaps.map((g) => [g.skillName, g]) : [],
  );

  const rows = unique.map((r) => {
    const described = noteBySkill.get(r.skillName!);
    return {
      clerkUserId: args.clerkUserId,
      analysisId: args.analysisId,
      skillId: args.skillIdByName.get(r.skillName!)!,
      userLevel: described?.userLevel ?? inferUserLevel(r.skillName!, args.bullets),
      requiredLevel: described?.requiredLevel ?? ("working" as const),
      mentionCount: r.mentionCount,
      note: described?.note ?? `The posting asks for ${r.skillName}; your profile doesn't evidence it yet.`,
    };
  });

  await db.insert(skillGaps).values(rows);
}

/** Fallback when the gap-notes call fails — the tab still works without prose. */
function inferUserLevel(skillName: string, bullets: DomainBullet[]): "none" | "exposure" {
  const mentioned = bullets.some((b) => skillsIn(b.text).includes(skillName));
  return mentioned ? "exposure" : "none";
}

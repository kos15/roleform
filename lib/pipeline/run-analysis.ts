import "server-only";
import { db } from "@/lib/db";
import { analyzeJd } from "@/lib/ai/analyze-jd";
import { tailorBullet, tailorSummary, type TailoredResult } from "@/lib/ai/tailor";
import { generateQuestions } from "@/lib/ai/interview";
import { buildLearningPlan } from "@/lib/learning/build-plan";
import { computeCoverage, scoreAnalysis } from "@/lib/domain/coverage";
import { orderSkills, rankBullets } from "@/lib/domain/ordering";
import { summariseChanges } from "@/lib/domain/diff";
import { canonicalSkill } from "@/lib/catalog/skills";
import { draftCount } from "@/lib/domain/entitlements";
import { PROTECTED_NOTICE, TokenAccumulator, scanProtected } from "@/lib/domain/guardrails";
import { ANALYSIS_TOKEN_CEILING } from "@/lib/domain/tokens";
import { TEMPLATES, ratingFor, type TemplateDef } from "@/lib/render/templates";
import { buildRenderModel, type RenderModel } from "@/lib/render/model";
import { renderFitted } from "@/lib/render/pdf";
import { getBullets, toDomainBullets } from "@/lib/db/queries/profile";
import { getCoverage, getProfileById, getRequirements } from "@/lib/db/queries/analysis";
import { progressFor, readStageState, type StageEmitter } from "./stages";
import type { AtsRating, DomainBullet, DomainCoverageItem, DomainRequirement } from "@/lib/domain/types";
import type { StoredResume } from "@/lib/ai/schemas/resume-json";

/**
 * The analysis pipeline (specs §8).
 *
 *   ① analyze-jd     → JdMeta + jd_requirements
 *   ② coverage       → coverage_items + score            [PURE, no LLM]
 *   ③ tailor         → 6 × resume_drafts + tailored_bullets
 *   ④ interview      → 10 × interview_questions
 *   ⑤ learning        → skill_gaps + learning_plan + learning_steps
 *
 * Degradation rule (specs §11): a failure on one surface degrades THAT tab and
 * nothing else. A failed Prep generation must never lose the résumés — so
 * stages ③–⑤ each catch their own failure, mark themselves degraded, and let
 * the run finish. Only stages ① and ② can fail the whole analysis, because
 * without requirements there is nothing to show at all.
 *
 * ── Resuming (specs §13) ────────────────────────────────────────────────────
 * "We resume rather than restart" is a promise the product makes on three
 * screens. It is kept HERE, and only here: every stage asks what it already
 * persisted and returns early if the answer is "everything". A run picked up
 * after a crash re-reads its own rows instead of re-billing the model for work
 * it already paid for.
 *
 * Before this, `runAnalysis` executed all four stages unconditionally. Because
 * `resume_drafts` and `learning_plans` carry unique constraints, that did not
 * quietly duplicate — it *threw*, and the second attempt at a half-finished run
 * degraded the exact tabs the first attempt had already written. Requirements,
 * coverage items and questions have no such constraint and did duplicate.
 *
 * The completeness test per stage is `resumeState` below. A stage that wrote
 * its rows in one `createMany` is all-or-nothing, so a single row proves it
 * finished. Drafts are written one per template in a loop, so that stage is
 * complete only at the full count — and a partial set is deleted before the
 * redo, because the unique constraint leaves no other way through.
 */
export async function runAnalysis(args: {
  clerkUserId: string;
  analysisId: string;
  emit: StageEmitter;
}): Promise<void> {
  const { clerkUserId, analysisId, emit } = args;

  const analysis = await db.analysis.findFirst({ where: { clerkUserId, id: analysisId } });
  if (!analysis) throw new Error("analysis not found");

  const profile = await getProfileById(clerkUserId, analysis.profileId);
  if (!profile) throw new Error("profile not found");

  const resume = profile.resumeJson as unknown as StoredResume;
  const bulletRows = await getBullets(clerkUserId, profile.id);
  const bullets = toDomainBullets(bulletRows);

  // Read once, at the top: the caps that apply are the ones in force when the
  // run started. An admin lowering a cap mid-run does not truncate a run that
  // is already paying for itself (F15).
  const account = (await db.user.findUnique({
    where: { clerkUserId },
    select: { capResumes: true, role: true },
  })) ?? { capResumes: TEMPLATES.length, role: "member" as const };

  // Admins render every template (lib/domain/entitlements.ts). `templatesFor`
  // takes a count rather than Infinity, because it slices an array — so the
  // uncapped value here is the only honest finite number: all of them.
  //
  // Shared with `draftsPerRun`, which is what the analyse screen promises. One
  // clamp, so the promise and the render cannot disagree.
  const capResumes = draftCount(account.role, account.capResumes, TEMPLATES.length);

  // specs §13: a profile with zero bullets blocks analysis. The tool has
  // nothing to work from, and saying so beats inventing something.
  if (bullets.length === 0) {
    await fail(analysisId, "Your profile has no experience bullets yet.");
    emit({ stage: "reading", state: "failed", progressPct: 0, message: "Your profile has no experience bullets yet." });
    return;
  }

  // The user's own top-level Skills section — declared without being tied to
  // one role, so it is legitimately allowed on any bullet's rewrite. Used
  // whole for the summary (which spans the whole résumé) and as the base for
  // each bullet's own scoped allowlist below (G6).
  const globalSkillTerms = [...resume.skills.map((s) => s.name), ...resume.skills.flatMap((s) => s.keywords)];
  const profileTerms = [...globalSkillTerms, ...bullets.flatMap((b) => b.skillNames)];

  // G6 — a tool the model infers from ONE role's bullet must not surface on
  // an unrelated role's rewrite. `checkFabrication`'s allowlist used to be
  // this whole-profile `profileTerms` for every bullet regardless of which
  // role it came from; a Kubernetes bullet under a 2019 internship could
  // license "Kubernetes" appearing on a rewrite of a 2024 role that never
  // mentioned it. Scoped instead to the skills a bullet's OWN role evidences,
  // grouped once here by `scopeRef` ("work.1") rather than re-filtered on
  // every one of the ~25 tailoring calls a run makes.
  const skillsByScope = new Map<string, string[]>();
  for (const b of bullets) {
    skillsByScope.set(b.scopeRef, [...(skillsByScope.get(b.scopeRef) ?? []), ...b.skillNames]);
  }
  const scopedTerms = (scopeRef: string) => [...globalSkillTerms, ...(skillsByScope.get(scopeRef) ?? [])];

  // What a previous attempt at this same analysis already finished. Every stage
  // below consults this before spending anything.
  const expectedDrafts = templatesFor(capResumes).length;
  const done = await resumeState({ clerkUserId, analysisId, expectedDrafts });

  /* ---------------------------------------------------- ① reading the posting */

  emit({ stage: "reading", state: "running", progressPct: progressFor("reading", "running") });

  let requirements: DomainRequirement[];
  let skillIdByName: Map<string, string>;
  // Only `title` and `company` are read downstream; the rest of JdMeta is
  // written to the analysis row and never looked at again in this function.
  let jobMeta: { title: string; company: string };

  if (done.reading) {
    // The requirements are already rows, and rows are what everything
    // downstream refers to by id — so they are read back rather than
    // regenerated. Regenerating would produce new ids and orphan the coverage
    // and questions that already point at the old ones.
    requirements = await getRequirements(clerkUserId, analysisId);
    skillIdByName = await resolveSkillIds(
      requirements.map((r) => r.skillName).filter((n): n is string => Boolean(n)),
    );
    jobMeta = { title: analysis.title ?? "", company: analysis.company ?? "" };
  } else {
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

    // IN-6, moved here from the learning engine (G3). Before this, a
    // discriminatory requirement was written to jd_requirements, scored,
    // fed to coverage and to the questions call, and only excluded once the
    // run reached stage ⑤ — everything upstream of learning saw it. Filtered
    // before the first row is written, so coverage, the score, tailoring and
    // the questions call never see one either.
    let protectedNotice: string | null = null;
    const admissible = parsed.filter((r) => {
      const scan = scanProtected(`${r.text} ${r.evidenceQuote}`);
      if (scan.blocked) protectedNotice = PROTECTED_NOTICE;
      return !scan.blocked;
    });

    skillIdByName = await resolveSkillIds(admissible.map((r) => r.skillName));

    const requirementRows = await db.jdRequirement.createManyAndReturn({
      data: admissible.map((r) => ({
        clerkUserId,
        analysisId,
        kind: r.kind,
        text: r.text,
        necessity: r.necessity,
        mentionCount: r.mentionCount,
        evidenceQuote: r.evidenceQuote,
        skillId: skillIdByName.get(canonicalSkill(r.skillName) ?? "") ?? null,
      })),
    });

    requirements = requirementRows.map((row, i) => ({
      id: row.id,
      kind: row.kind,
      text: row.text,
      necessity: row.necessity,
      mentionCount: row.mentionCount,
      evidenceQuote: row.evidenceQuote,
      skillName: canonicalSkill(admissible[i].skillName),
    }));

    await db.analysis.update({
      where: { id: analysisId },
      data: {
        company: meta.company || null,
        title: meta.title || null,
        location: meta.location || null,
        seniority: meta.seniority,
        employmentType: meta.employmentType,
        // Merged with the existing state (`injection`, written by
        // createAnalysis before this stage ran), never overwritten — G4/G3.
        stageState: {
          ...readStageState(analysis.stageState),
          usedRegions: jd.value.analysis.usedRegions,
          truncated: jd.value.truncated,
          protectedNotice,
        },
      },
    });

    jobMeta = { title: meta.title, company: meta.company };
  }

  emit({ stage: "reading", state: "done", progressPct: progressFor("reading", "done") });

  /* ------------------------------------- ② coverage + score — PURE, no LLM */

  emit({ stage: "matching", state: "running", progressPct: progressFor("matching", "running") });

  const profileSkillNames = resume.skills.map((s) => s.name);

  // Read back rather than recomputed when it exists. `computeCoverage` is pure
  // and would return the same answer for the same inputs — but the profile may
  // have been edited between the two attempts, and the stored rows are what the
  // score header and the buckets are already showing. Downstream stages must
  // work from the same coverage the user is looking at.
  const coverage = done.matching
    ? await getCoverage(clerkUserId, analysisId)
    : computeCoverage(requirements, bullets, profileSkillNames);

  // Pure, sub-millisecond, and needed by ③ and ④ either way — so it is derived
  // on both paths rather than stored and reloaded.
  const scored = scoreAnalysis(requirements, coverage);

  if (!done.matching) {
    await db.coverageItem.createMany({
      data: coverage.map((c) => ({
        clerkUserId,
        analysisId,
        requirementId: c.requirementId,
        status: c.status,
        evidenceBulletIds: c.evidenceBulletIds,
        rationale: c.rationale,
      })),
    });
  }

  // Written on BOTH paths, including the skip.
  //
  // `fail()` reports a stage failure by putting its message in `scoreNote` —
  // the same column the score's own calibration lives in. So a run that failed
  // has already lost that sentence, and a resume that skipped this stage would
  // leave the results header explaining the crash where it should be explaining
  // the number. Three derived values from rows we are already holding: writing
  // them again is idempotent and repairs the note.
  await db.analysis.update({
    where: { id: analysisId },
    data: {
      score: scored.score.toFixed(2),
      scoreVerdict: scored.verdict,
      scoreNote: scored.note,
    },
  });

  emit({ stage: "matching", state: "done", progressPct: progressFor("matching", "done") });

  /* -------------------------------------------------------------- ③ tailoring */

  emit({ stage: "rewriting", state: "running", progressPct: progressFor("rewriting", "running") });

  const tailored: TailoredResult[] = [];
  let summaryLine = "";
  let professionalSummary = "";

  // The expensive stage: one model call per bullet plus one for the summary.
  // Skipping it is most of what "resume rather than restart" is worth.
  if (done.rewriting) {
    emit({ stage: "rewriting", state: "done", progressPct: progressFor("rewriting", "done") });
  } else {
    try {
      const ranked = rankBullets(bullets, requirements, coverage);
      const requirementById = new Map(requirements.map((r) => [r.id, r]));

      // GR-5: the pipeline's own per-run ceiling. One long profile times one
      // corrective retry on every bullet had no bound before this — past the
      // ceiling, remaining bullets go out exactly as written rather than the
      // run spending whatever it takes to keep rewriting.
      const budget = new TokenAccumulator(ANALYSIS_TOKEN_CEILING);
      let ceilingHit = false;

      // One call per bullet, each scoped to its single best-matching requirement.
      // Sequential rather than parallel: the per-user rate limit matters more here
      // than latency, and the pipeline already streams progress.
      for (const entry of ranked) {
        if (budget.exceeded()) {
          ceilingHit = true;
          tailored.push({
            sourceBulletId: entry.bullet.id,
            originalText: entry.bullet.text,
            rewrittenText: entry.bullet.text,
            transform: "verbatim",
            targetsRequirementId: null,
            aiRunId: null,
            blockedBy: ["token_ceiling"],
            tokensUsed: 0,
          });
          continue;
        }

        const target = entry.requirementIds
          .map((id) => requirementById.get(id))
          .filter((r): r is DomainRequirement => Boolean(r))
          .sort((a, b) => weight(b) - weight(a))[0];

        const result = await tailorBullet({
          clerkUserId,
          analysisId,
          bullet: entry.bullet,
          requirement: target ?? null,
          profileTerms: scopedTerms(entry.bullet.scopeRef),
          jobTitle: jobMeta.title,
        });
        if (result.ok) {
          tailored.push(result.value);
          budget.add(result.value.tokensUsed);
        }
      }

      const summary = await tailorSummary({
        clerkUserId,
        analysisId,
        jobTitle: jobMeta.title,
        tailored,
        profileTerms,
      });
      if (summary.ok) {
        summaryLine = summary.value.summary;
        professionalSummary = summary.value.professionalSummary;
      }

      await writeDrafts({
        clerkUserId,
        capResumes,
        analysisId,
        resume,
        requirements,
        profileSkillNames,
        tailored,
        professionalSummary,
        summaryLine,
        absent: scored.buckets.absent,
      });

      // GR-5: past the ceiling the stage still finished — every bullet has a
      // draft — it just could not rewrite all of them. Degraded, not failed:
      // the other tabs, and every bullet that was rewritten, are unaffected.
      emit(
        ceilingHit
          ? {
              stage: "rewriting",
              state: "degraded",
              progressPct: progressFor("rewriting", "done"),
              message:
                "This posting was long enough that we stopped rewriting partway through — the rest of your bullets kept their original wording.",
            }
          : { stage: "rewriting", state: "done", progressPct: progressFor("rewriting", "done") },
      );
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
  }

  /* ------------------------------------------------- ④ + ⑤ prep and learning */

  emit({ stage: "preparing", state: "running", progressPct: progressFor("preparing", "running") });

  let prepDegraded = false;
  if (!done.preparing) {
    try {
      await writeQuestions({
        clerkUserId,
        analysisId,
        meta: jobMeta,
        requirements,
        bullets,
        coverage,
        absent: scored.buckets.absent,
      });
    } catch (e) {
      prepDegraded = true;
      logStageFailure("prep", e);
    }
  }

  let learningDegraded = false;
  if (!done.learning) {
    try {
      // The Learning Engine, S3–S7 (lib/learning/build-plan.ts). One large-model
      // call; everything else is a pure function or a primary-key read against
      // the precomputed bundles.
      //
      // It runs AFTER writeQuestions on purpose: the proof-of-learning loop binds
      // every recommended resource to an interview question, and a question that
      // doesn't exist yet cannot be bound to. When Prep degrades, gaps still get
      // written — they just fall through to roadmap fallbacks rather than steps,
      // which is the honest consequence rather than a silent one.
      const learning = await buildLearningPlan({
        clerkUserId,
        analysisId,
        jobTitle: jobMeta.title,
        requirements,
        coverage,
        bullets,
        profileSkillNames,
        skillIdByName,
        // No budget on the analysis run. The knapsack is pure and re-solvable in
        // milliseconds, so the Learning tab re-plans against whatever budget the
        // user picks without spending a token or touching the model (spec §10).
        budgetMin: null,
      });
      learningDegraded = learning.narrativeDegraded;
    } catch (e) {
      learningDegraded = true;
      logStageFailure("learning", e);
    }
  }

  await db.analysis.update({ where: { id: analysisId }, data: { status: "ready" } });

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

/**
 * Which stages a previous attempt at this analysis already finished.
 *
 * One query. The completeness test differs per stage because the write pattern
 * does, and "some rows exist" is only proof of completion for a stage that
 * writes its rows in a single statement:
 *
 * | stage     | writes                       | complete when |
 * |-----------|------------------------------|---------------|
 * | reading   | one `createManyAndReturn`    | any row       |
 * | matching  | one `createMany`             | any row       |
 * | rewriting | one `create` per template    | the full count |
 * | preparing | one `createMany`             | any row       |
 * | learning  | plan first, then gaps/steps  | the plan row  |
 *
 * A half-written draft set is deleted rather than topped up. `resume_drafts`
 * has a unique on (analysisId, templateId), so a redo over a partial set would
 * throw on the first template that already exists — and the drafts all share
 * one tailored set, so keeping three from an old run beside eight from a new
 * one would put two different rewrites of the same history in one analysis.
 * The tailored bullets under them cascade.
 *
 * `learning` is judged by the plan alone. Gaps written under a plan that then
 * failed are left where they are: the plan row is unique per analysis, so they
 * cannot be duplicated by a redo, and a gap the user can read is worth more
 * than the tidiness of deleting it.
 */
async function resumeState(args: {
  clerkUserId: string;
  analysisId: string;
  expectedDrafts: number;
}): Promise<{
  reading: boolean;
  matching: boolean;
  rewriting: boolean;
  preparing: boolean;
  learning: boolean;
}> {
  const { clerkUserId, analysisId, expectedDrafts } = args;

  const row = await db.analysis.findFirst({
    where: { clerkUserId, id: analysisId },
    select: {
      _count: {
        select: {
          jdRequirements: true,
          coverageItems: true,
          resumeDrafts: true,
          interviewQuestions: true,
        },
      },
      learningPlan: { select: { id: true } },
    },
  });

  if (!row) {
    return { reading: false, matching: false, rewriting: false, preparing: false, learning: false };
  }

  const drafts = row._count.resumeDrafts;
  if (drafts > 0 && drafts < expectedDrafts) {
    await db.resumeDraft.deleteMany({ where: { clerkUserId, analysisId } });
  }

  return {
    reading: row._count.jdRequirements > 0,
    matching: row._count.coverageItems > 0,
    rewriting: expectedDrafts > 0 && drafts >= expectedDrafts,
    preparing: row._count.interviewQuestions > 0,
    learning: row.learningPlan !== null,
  };
}

async function fail(analysisId: string, message: string) {
  // specs §13: keep the completed stages, mark the run failed. Resume, not restart.
  await db.analysis.update({
    where: { id: analysisId },
    data: { status: "failed", scoreNote: message },
  });
}

/** N7: log the stage and the error shape, never the document. */
function logStageFailure(stage: string, e: unknown) {
  // The error NAME alone is not enough to act on. A stage that fails with
  // "PrismaClientKnownRequestError" and nothing else costs a diagnostic cycle
  // to find out which constraint rejected what — this line used to say exactly
  // that, and it did.
  //
  // A Prisma error code and a constraint name are our own schema identifiers,
  // never user content, so adding them keeps N7 intact while making the log
  // answer the question you actually have when you read it.
  const parts = [`stage=${stage}`, `error=${e instanceof Error ? e.name : "unknown"}`];

  if (e && typeof e === "object") {
    const record = e as Record<string, unknown>;
    if ("code" in record) parts.push(`code=${String(record.code)}`);

    const meta = record.meta;
    if (meta && typeof meta === "object") {
      const constraint = (meta as Record<string, unknown>).constraint;
      if (typeof constraint === "string") parts.push(`constraint=${constraint}`);
    }
  }

  console.error(`[pipeline] ${parts.join(" ")}`);
}

async function resolveSkillIds(names: string[]): Promise<Map<string, string>> {
  const canonical = [...new Set(names.map((n) => canonicalSkill(n)).filter((n): n is string => Boolean(n)))];
  if (canonical.length === 0) return new Map();
  const rows = await db.skill.findMany({
    where: { name: { in: canonical } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.name, r.id]));
}

/**
 * Eleven drafts from ONE tailored set (M4.4).
 *
 * The drafts differ in template and in ordering, not in claims — eleven
 * independent rewrites of the same fact would produce eleven subtly different
 * versions of the
 * user's history, which is exactly what the spine exists to prevent.
 */
/**
 * Which templates render, under this member's `capResumes` (F15).
 *
 * Below eleven we render the highest-ATS ones first, because a member who only
 * gets three drafts should get the three most likely to survive a parser — not
 * the three that happened to be first in the array. Ties keep declaration
 * order, so the choice is stable between runs.
 */
function templatesFor(cap: number): TemplateDef[] {
  if (cap >= TEMPLATES.length) return TEMPLATES;
  const rank: Record<AtsRating, number> = { High: 0, Medium: 1, Low: 2 };
  return [...TEMPLATES]
    .map((t, i) => ({ t, i, r: rank[ratingFor(t.id)] }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, Math.max(0, cap))
    .map((x) => x.t);
}

async function writeDrafts(args: {
  clerkUserId: string;
  /** 0–11. Set per member in the admin panel; eleven by default. */
  capResumes: number;
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

  const resumeJson = {
    ...args.resume,
    basics: { ...args.resume.basics, summary: args.professionalSummary || args.resume.basics.summary },
    x_roleform: args.resume.x_roleform,
    x_orderedSkills: orderedSkills,
  };

  // The same model the exporter builds, so the page count stored here is the
  // page count the user downloads.
  const model = buildRenderModel({
    resume: resumeJson,
    tailored: args.tailored.map((t) => ({
      sourceBulletId: t.sourceBulletId,
      rewrittenText: t.rewrittenText,
      transform: t.transform,
    })),
    orderedSkills,
    summary: resumeJson.basics.summary,
  });

  for (const template of templatesFor(args.capResumes)) {
    const draft = await db.resumeDraft.create({
      data: {
        clerkUserId: args.clerkUserId,
        analysisId: args.analysisId,
        templateId: template.id,
        resumeJson: resumeJson as object,
        // N5: computed from structural rules, never hand-assigned.
        atsRating: ratingFor(template.id),
        pageCount: await measurePages(model, template.id, args.tailored.length),
        changes: [args.summaryLine, ...changes].filter(Boolean).slice(0, 8),
        missing,
      },
      select: { id: true },
    });

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
    if (rows.length > 0) await db.tailoredBullet.createMany({ data: rows });
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

/**
 * The résumés card shows a page count, so it is measured, not guessed.
 *
 * A guess from bullet count was wrong in the direction that costs the user
 * trust — it promised one page for a document that exported as two. The
 * renderer already lays out to fit (lib/render/pdf), so asking it is the only
 * answer that can't disagree with the download. Layout is per-template, hence
 * the call per template rather than one shared number.
 *
 * A render failure here must not fail an otherwise complete analysis; the old
 * heuristic stands in, and the stage is logged.
 */
async function measurePages(
  model: RenderModel,
  templateId: string,
  bulletCount: number,
): Promise<number> {
  try {
    return (await renderFitted(model, templateId)).pageCount;
  } catch (e) {
    logStageFailure(`pagecount:${templateId}`, e);
    return bulletCount > 22 ? 2 : 1;
  }
}

/** Bullets get ranked, not just truncated (PR-5): interview.ts stays unaware of coverage. */
const MAX_QUESTION_BULLETS = 40;

async function writeQuestions(args: {
  clerkUserId: string;
  analysisId: string;
  meta: { title: string; company: string };
  requirements: DomainRequirement[];
  bullets: DomainBullet[];
  coverage: DomainCoverageItem[];
  absent: DomainRequirement[];
}) {
  // Trimmed by relevance before the call, not by the model (PR-5, G15). A
  // profile with more than forty bullets used to send every one of them on
  // every analysis; `rankBullets` (already computed for tailoring, reused
  // here rather than duplicated) puts the ones a coverage item actually
  // cited first, so the cut falls on the bullets least likely to matter.
  const rankedBullets = rankBullets(args.bullets, args.requirements, args.coverage)
    .slice(0, MAX_QUESTION_BULLETS)
    .map((r) => r.bullet);

  const result = await generateQuestions({
    clerkUserId: args.clerkUserId,
    analysisId: args.analysisId,
    jobTitle: args.meta.title,
    company: args.meta.company,
    requirements: args.requirements,
    bullets: rankedBullets,
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
  if (rows.length > 0) await db.interviewQuestion.createMany({ data: rows });
}


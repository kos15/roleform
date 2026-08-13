import "server-only";
import { db } from "@/lib/db";
import { nodeFor, roadmapUrl } from "@/lib/catalog/taxonomy";
import { normaliseSkill } from "@/lib/catalog/skills";
import { bindBullet, bindQuestion } from "@/lib/domain/binding";
import { PROTECTED_NOTICE, scanForInjection, scanProtected } from "@/lib/domain/guardrails";
import { solvePlan, type PlannableStep } from "@/lib/domain/plan";
import { resolveTerms, resolutionRate } from "@/lib/domain/resolve";
import { fallbackFor, selectResources, type BundledResource } from "@/lib/domain/selection";
import { MAX_GAPS, rankGaps, type ScoredGap } from "@/lib/domain/severity";
import { synthesisePlan, type SynthesisGap } from "@/lib/ai/synthesise-plan";
import type {
  DomainBullet,
  DomainCoverageItem,
  DomainRequirement,
  RequiredLevel,
  UserLevel,
} from "@/lib/domain/types";
import type { EvidenceBucket, SkillLevel } from "@/lib/generated/prisma/enums";
import { key, lookupBundles, recordCorpusGap, recordUnresolved } from "./bundles";
import { assertResourcesLive } from "./validate";

/**
 * The learning engine's request path, S3 → S7, in one place.
 *
 * ```
 *  S3  RESOLVE      free text → canonical skill        0 tokens
 *  S4  SCORE        importance × evidence → severity   0 tokens
 *  S5  RETRIEVE     skill → precomputed bundle         0 tokens
 *  S5b SELECT       deterministic personalisation      0 tokens
 *  S5c BIND         gap → bullet, gap → question       0 tokens
 *  S5.5 PLAN        knapsack over durations            0 tokens
 *  S6  SYNTHESISE   narrative + staged bullets         ONE large call
 *  S7  VALIDATE     OUT-1, schema, link resolution     0 tokens
 * ```
 *
 * Eight stages, one billable call. That ratio is the entire design (spec §0):
 * every expensive operation happens once at ingest time, never at query time,
 * because request-time work is billed to the user on every single run while
 * ingest-time work is amortised across all users forever.
 *
 * ── This is a fixed DAG, not an agent ───────────────────────────────────────
 * agent.md §2: an autonomous agent decides its own steps, which means it decides
 * its own token spend, which is an unbounded liability on someone else's card
 * when the user is billed per run. Stages here cannot skip, loop, or invoke each
 * other. If a stage fails, the run degrades one rung (agent.md §7) and carries
 * on — it never retries its way into a bigger bill.
 */

export interface BuildPlanArgs {
  clerkUserId: string;
  analysisId: string;
  jobTitle: string;
  requirements: DomainRequirement[];
  coverage: DomainCoverageItem[];
  bullets: DomainBullet[];
  profileSkillNames: string[];
  /** canonical name → skills.id, resolved once by the pipeline. */
  skillIdByName: Map<string, string>;
  /** The user's stated study budget in minutes, or null for "everything". */
  budgetMin: number | null;
  /** Raw JD text, scanned for injection markers (IN-5). Never logged. */
  rawJdText: string;
}

export interface BuildPlanResult {
  gapCount: number;
  fallbackCount: number;
  stepCount: number;
  /** True when S6 failed and the plan is serving without its narrative. */
  narrativeDegraded: boolean;
  /** Set when IN-6 fired on at least one requirement. Shown once, neutrally. */
  protectedNotice: string | null;
}

export async function buildLearningPlan(args: BuildPlanArgs): Promise<BuildPlanResult> {
  /* ------------------------------------------------- S3 · resolve + park misses */

  // The extractor emits surface forms; S3 canonicalises them for free. Terms it
  // cannot place are parked rather than guessed, because an unresolved term
  // excluded from the analysis is a gap we don't mention — always better than a
  // gap we invent (spec §4, tier 4).
  //
  // ★ Only requirements the extractor NAMED a skill for are resolvable.
  //
  // This used to fall back to the requirement's full text when `skillName` was
  // empty. But an empty `skillName` is the JD extractor doing its job — its
  // instruction is "skillName only when it maps to a real, named technology or
  // discipline… never invent a skill to fill the field." Feeding the leftover
  // prose to a skill resolver guarantees a miss, and the misses went straight
  // into `unresolved_terms`:
  //
  //   2×  "5+ years building production web applications"
  //   1×  "Mentor two mid-level engineers and lead code review"
  //
  // That table ranked by frequency is supposed to be the taxonomy backlog —
  // the list of aliases and nodes to add next, derived from the market. Full of
  // sentences that will never be skills, it is unreadable as one, and the
  // resolution rate it feeds reads far below the truth.
  const resolutions = resolveTerms(
    args.requirements
      .map((r) => r.skillName ?? "")
      .filter((t) => t.trim().length > 0),
  );
  const rate = resolutionRate(resolutions);
  await recordUnresolved(
    resolutions
      .filter((r) => r.skillName === null)
      .map((r) => ({ term: r.term, normalised: normaliseSkill(r.term) })),
  );

  // IN-5. A flagged run proceeds — output containment is the real defence, and
  // it runs on every run regardless. What the flag buys is a log line that
  // explains an anomaly later. Pattern names only, never the matched text (N7).
  const injection = scanForInjection(args.rawJdText);
  if (injection.flagged) {
    console.warn(`[learning] injection_patterns=${injection.patterns.join(",")}`);
  }

  /* ------------------------------------------------------- IN-6 · the firewall */

  // A discriminatory requirement never becomes a gap, never reaches a model,
  // and never produces a course recommendation. It is flagged once, neutrally.
  let protectedNotice: string | null = null;
  const admissible = args.requirements.filter((r) => {
    const scan = scanProtected(`${r.text} ${r.evidenceQuote}`);
    if (scan.blocked) protectedNotice = PROTECTED_NOTICE;
    return !scan.blocked;
  });

  /* ------------------------------------------------------------ S4 · rank gaps */

  const ranked = rankGaps({
    requirements: admissible,
    coverage: args.coverage,
    bullets: args.bullets,
    profileSkillNames: args.profileSkillNames,
    jobTitle: args.jobTitle,
    limit: MAX_GAPS,
  }).filter((gap) => args.skillIdByName.has(gap.skillName));

  if (ranked.length === 0) {
    // A profile that evidences everything is a real outcome, and an empty tab
    // is the honest way to show it. We never pad (specs §13).
    return {
      gapCount: 0,
      fallbackCount: 0,
      stepCount: 0,
      narrativeDegraded: false,
      protectedNotice,
    };
  }

  /* --------------------------------------- S5 · bundle lookup + personalisation */

  const levelByGap = new Map(ranked.map((gap) => [gap.skillName, targetLevelFor(gap)]));

  const bundles = await lookupBundles(
    ranked.map((gap) => ({
      skillId: args.skillIdByName.get(gap.skillName)!,
      level: levelByGap.get(gap.skillName)!,
    })),
  );

  const questions = await db.interviewQuestion.findMany({
    where: { clerkUserId: args.clerkUserId, analysisId: args.analysisId },
    select: { id: true, text: true, type: true, sourceRequirementId: true },
    orderBy: { ordinal: "asc" },
  });

  interface PreparedGap {
    scored: ScoredGap;
    skillId: string;
    level: SkillLevel;
    resources: BundledResource[];
    bulletId: string | null;
    bulletText: string | null;
    questionId: string | null;
    fallback: { url: string; label: string } | null;
  }

  const prepared: PreparedGap[] = [];

  // One question answers one gap. Without this, every gap that failed to match
  // anything grabbed the same question and three cards claimed the same
  // interview moment — see lib/domain/binding.ts.
  const claimedQuestions = new Set<string>();

  for (const gap of ranked) {
    const skillId = args.skillIdByName.get(gap.skillName)!;
    const level = levelByGap.get(gap.skillName)!;
    const node = nodeFor(gap.skillName);

    const bundle = bundles.get(key(skillId, level)) ?? [];
    const selected = selectResources(bundle, {
      severity: gap.severity,
      volatility: node?.volatility ?? "medium",
      profileSkillNames: args.profileSkillNames,
      minutesAvailable: args.budgetMin,
    });

    // ★ The proof-of-learning loop (spec §1) — offered, not gated on.
    //
    // Spec §1's literal rule is that a resource bound to fewer than all three
    // things is not shown, and this used to enforce it: no bullet or no
    // question meant no material, only a roadmap link. Measured end to end,
    // that withheld vetted resources for 5 of 6 gaps.
    //
    // The rule is aimed at a FALSE binding, and a false binding is no longer
    // reachable — `bindBullet` and `bindQuestion` return null rather than
    // reaching for something arbitrary, and `unlocks_bullet_draft` cannot exist
    // without a bullet (CHECK skill_gaps_draft_needs_bullet). So the material
    // is shown, and the loop is shown on top of it wherever it was genuinely
    // earned. A card that offers two Kubernetes resources and claims nothing
    // about this candidate's history claims nothing false.
    const bullet = bindBullet(gap.skillName, gap.requirement, args.bullets);
    const question = bindQuestion(gap.skillName, gap.requirement, questions, claimedQuestions);
    if (question) claimedQuestions.add(question.id);

    const usable = selected;

    // A fallback now means exactly one thing: the corpus had nothing. That is
    // what makes `corpus_gaps` readable as an ingestion backlog — every row in
    // it is a hole indexing can actually fill.
    if (selected.length === 0) await recordCorpusGap(skillId, level);

    prepared.push({
      scored: gap,
      skillId,
      level,
      resources: usable,
      bulletId: bullet?.id ?? null,
      bulletText: bullet?.text ?? null,
      questionId: question?.id ?? null,
      fallback: usable.length === 0 ? fallbackFor(roadmapUrl(gap.skillName)) : null,
    });
  }

  /* --------------------------------------------------- S5.5 · solve the budget */

  const plannable: PlannableStep[] = prepared.flatMap((gap) =>
    gap.resources.map((resource, rank) => ({
      key: `${gap.skillId}:${resource.id}`,
      skillName: gap.scored.skillName,
      severity: gap.scored.severity,
      rankInGap: rank,
      durationMin: resource.durationMin,
    })),
  );

  const solved = solvePlan(plannable, args.budgetMin);
  const scheduled = new Map(solved.steps.map((s) => [s.key, s]));

  // Only what actually made the plan reaches S6. Deferred steps are stored and
  // rendered, but narrating material the user has no time for would spend
  // tokens on advice the plan itself already declined to give.
  for (const gap of prepared) {
    gap.resources = gap.resources.filter((r) => scheduled.has(`${gap.skillId}:${r.id}`));
    if (gap.resources.length === 0 && !gap.fallback) {
      gap.fallback = fallbackFor(roadmapUrl(gap.scored.skillName));
    }
  }

  /* ------------------------------------------------------------- S6 · one call */

  const synthesisGaps: SynthesisGap[] = prepared.map((gap) => ({
    skillName: gap.scored.skillName,
    evidence: gap.scored.evidence.bucket,
    requirementText: gap.scored.requirement.text,
    evidenceQuote: gap.scored.requirement.evidenceQuote,
    currentEvidence: gap.scored.evidence.bucket === "none" ? null : gap.scored.evidence.rationale,
    existingBullet: gap.bulletId && gap.bulletText ? { id: gap.bulletId, text: gap.bulletText } : null,
    resources: gap.resources.map((r) => ({
      id: r.id,
      title: r.title,
      author: r.author,
      entry: r.entryLabel,
      durationMin: r.durationMin,
      summary: r.summary,
    })),
  }));

  const synthesis = await synthesisePlan({
    clerkUserId: args.clerkUserId,
    analysisId: args.analysisId,
    jobTitle: args.jobTitle,
    matchedStrengths: strongestMatches(args.requirements, args.coverage),
    budgetMin: args.budgetMin,
    gaps: synthesisGaps,
  });

  const narrative = synthesis.ok ? synthesis.value.plan : null;
  const bySkill = new Map((narrative?.gaps ?? []).map((g) => [g.skillName, g]));

  /* ------------------------------------------------------------ S7 · validate */

  // OUT-1's second half. The ids came out of our own database a few lines ago,
  // so this can only fail if a verifier sweep killed a resource mid-run — but
  // "can only fail rarely" is exactly the shape of check that is worth keeping,
  // because the failure it prevents is a 404 in front of a job-hunter.
  const live = await assertResourcesLive(prepared.flatMap((g) => g.resources.map((r) => r.id)));
  for (const gap of prepared) {
    gap.resources = gap.resources.filter((r) => live.has(r.id));
    if (gap.resources.length === 0 && !gap.fallback) {
      gap.fallback = fallbackFor(roadmapUrl(gap.scored.skillName));
    }
  }

  /* ----------------------------------------------------------------- persist */

  const plan = await db.learningPlan.create({
    data: {
      clerkUserId: args.clerkUserId,
      analysisId: args.analysisId,
      opening: narrative?.opening ?? "",
      sequenceNote: narrative?.sequenceNote ?? "",
      budgetMin: args.budgetMin,
      totalMin: solved.totalMin,
      fallbackCount: prepared.filter((g) => g.fallback).length,
      resolutionRate: rate.toFixed(3),
      aiRunId: synthesis.ok ? synthesis.value.aiRunId : null,
    },
    select: { id: true },
  });

  let stepCount = 0;

  for (const [ordinal, gap] of prepared.entries()) {
    const written = bySkill.get(gap.scored.skillName);

    const gapRow = await db.skillGap.create({
      data: {
        clerkUserId: args.clerkUserId,
        analysisId: args.analysisId,
        skillId: gap.skillId,
        ordinal,
        severity: gap.scored.severity.toFixed(2),
        importance: gap.scored.importance.toFixed(3),
        evidenceCredit: gap.scored.evidence.credit.toFixed(3),
        evidenceBucket: gap.scored.evidence.bucket as EvidenceBucket,
        targetLevel: gap.level,
        requirementId: gap.scored.requirement.id,
        mentionCount: gap.scored.requirement.mentionCount,
        // OUT-5: the meter and the prose are generated from the same
        // deterministic evidence value, so they cannot disagree.
        userLevel: userLevelFor(gap.scored.evidence.credit),
        requiredLevel: requiredLevelFor(gap.level),
        note: gap.scored.evidence.rationale,
        jdQuote: written?.jdQuote ?? gap.scored.requirement.evidenceQuote,
        whyItMatters: written?.whyItMatters ?? "",
        unlocksBulletId: gap.bulletId,
        // ★ OUT-2, enforced here so the CHECK never has to.
        //
        // The synthesiser is told to return an empty draft when it was given no
        // bullet. It does not always comply — the first run after the CHECK
        // went in died on exactly this, a staged rewrite for a gap with nothing
        // to rewrite. That is the fabrication OUT-2 exists to stop, and the
        // constraint caught it correctly.
        //
        // But a constraint firing takes the whole stage down, and the right
        // response to one bad field is to drop the field, not the plan. The
        // CHECK stays as the backstop that proves this line is doing its job.
        unlocksBulletDraft: gap.bulletId ? written?.unlocksBulletDraft?.trim() || null : null,
        answersQuestionId: gap.questionId,
        fallbackUrl: gap.fallback?.url ?? null,
        fallbackLabel: gap.fallback?.label ?? null,
      },
      select: { id: true },
    });

    const noteById = new Map((written?.resources ?? []).map((r) => [r.id, r.note]));

    for (const resource of gap.resources) {
      const step = scheduled.get(`${gap.skillId}:${resource.id}`);
      if (!step) continue;

      await db.learningStep.create({
        data: {
          clerkUserId: args.clerkUserId,
          planId: plan.id,
          gapId: gapRow.id,
          courseId: resource.id,
          ordinal: step.order,
          startsAtMin: step.startsAtMin,
          durationMin: Math.max(1, resource.durationMin),
          entryLabel: resource.entryLabel,
          entryUrl: resource.entryUrl,
          note: noteById.get(resource.id) ?? "",
          unlocksBulletId: gap.bulletId,
          answersQuestionId: gap.questionId,
        },
      });
      stepCount++;
    }
  }

  return {
    gapCount: prepared.length,
    fallbackCount: prepared.filter((g) => g.fallback).length,
    stepCount,
    narrativeDegraded: !synthesis.ok,
    protectedNotice,
  };
}

/* ------------------------------------------------------------------ helpers */

/**
 * The depth this posting asks the skill to, in bundle terms.
 *
 * Deterministic on purpose: `level` is half the bundle's primary key, so an
 * LLM guessing it would make retrieval non-reproducible for zero benefit. Spec
 * §5's note applies — years-of-experience language changes WHAT to learn, not
 * whether, and this is where that lands.
 */
function targetLevelFor(gap: ScoredGap): SkillLevel {
  const { necessity, mentionCount } = gap.requirement;
  if (necessity === "required" && mentionCount >= 3) return "deep";
  if (necessity === "required") return "working";
  if (necessity === "implied") return "working";
  return "intro";
}

/** The §6 credit, expressed on the five-rung meter the Learning tab draws. */
function userLevelFor(credit: number): UserLevel {
  if (credit >= 0.85) return "strong";
  if (credit > 0.5) return "working";
  if (credit > 0) return "exposure";
  return "none";
}

function requiredLevelFor(level: SkillLevel): RequiredLevel {
  return level === "deep" ? "strong" : level === "working" ? "working" : "exposure";
}

/**
 * What the opening leads with. OUT-6: lead with what already matches before
 * what does not — someone reading this is job-hunting, and an audit that opens
 * on the deficit is a worse document than one that opens on the fit.
 */
function strongestMatches(
  requirements: DomainRequirement[],
  coverage: DomainCoverageItem[],
): string[] {
  const evidenced = new Set(
    coverage.filter((c) => c.status === "evidenced").map((c) => c.requirementId),
  );
  return [
    ...new Set(
      requirements
        .filter((r) => evidenced.has(r.id) && r.skillName)
        .sort((a, b) => b.mentionCount - a.mentionCount)
        .map((r) => r.skillName!),
    ),
  ];
}

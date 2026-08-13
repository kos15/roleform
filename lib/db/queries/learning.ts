import "server-only";
import { db } from "@/lib/db";
import { roadmapUrl } from "@/lib/catalog/taxonomy";
import { solvePlan, type PlannableStep } from "@/lib/domain/plan";
import type { EvidenceBucket, SkillLevel } from "@/lib/generated/prisma/enums";
import type { RequiredLevel, UserLevel } from "@/lib/domain/types";

/**
 * The Learning tab's read path.
 *
 * ── Why the budget is re-solved on read ─────────────────────────────────────
 * The knapsack (lib/domain/plan.ts) is a pure function that runs in single-digit
 * milliseconds. So when the user changes "I have 6 hours" to "I have 2", we
 * re-solve here rather than re-running the analysis: the gaps, the resources,
 * the bindings and the narrative are all unchanged — only which steps fit and
 * in what order changes, and that is arithmetic.
 *
 * This is spec §0's spine applied to an interaction rather than to ingest: the
 * expensive part happened once, and every subsequent question about it is
 * answered for zero tokens.
 */

export interface LearningStepView {
  id: string;
  courseId: string;
  title: string;
  provider: string;
  author: string | null;
  mark: string;
  /** Read from the database, never from model output (OUT-1). */
  url: string;
  /** The deep link to the exact segment, when we have one (spec §8). */
  entryUrl: string | null;
  entryLabel: string | null;
  priceLabel: string;
  isFree: boolean;
  durationMin: number;
  note: string;
  /** Position after the current budget was solved for. */
  order: number;
  startsAtMin: number;
  /** True when this step did not fit the budget the user asked for. */
  deferred: boolean;
}

export interface LearningGapView {
  id: string;
  skillName: string;
  skillSlug: string | null;
  severity: number;
  evidenceBucket: EvidenceBucket;
  userLevel: UserLevel;
  requiredLevel: RequiredLevel;
  targetLevel: SkillLevel;
  mentionCount: number;
  /** The deterministic evidence rationale. Always present. */
  note: string;
  /** S6's one sentence. Empty when the narrative degraded. */
  whyItMatters: string;
  jdQuote: string;
  /** The proof-of-learning loop, spec §1. */
  unlocksBullet: { id: string; text: string; draft: string } | null;
  answersQuestion: { id: string; text: string } | null;
  fallback: { url: string; label: string } | null;
  steps: LearningStepView[];
}

export interface LearningPlanView {
  opening: string;
  sequenceNote: string;
  /** The budget this view was solved against, in minutes. Null = everything. */
  budgetMin: number | null;
  totalMin: number;
  fallbackCount: number;
  gaps: LearningGapView[];
}

export async function getLearningPlan(
  clerkUserId: string,
  analysisId: string,
  budgetMin: number | null,
): Promise<LearningPlanView | null> {
  const gaps = await db.skillGap.findMany({
    where: { clerkUserId, analysisId },
    orderBy: [{ ordinal: "asc" }, { severity: "desc" }],
    include: {
      skill: { select: { name: true, slug: true } },
      unlocksBullet: { select: { id: true, text: true } },
      answersQuestion: { select: { id: true, text: true } },
      steps: {
        orderBy: { ordinal: "asc" },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              provider: true,
              author: true,
              mark: true,
              url: true,
              priceLabel: true,
              isFree: true,
            },
          },
        },
      },
    },
  });

  if (gaps.length === 0) return null;

  const plan = await db.learningPlan.findUnique({ where: { analysisId } });

  // Re-solve for whatever budget is in force now. When the caller passes null,
  // this is a pure re-ordering and nothing is deferred.
  const plannable: PlannableStep[] = gaps.flatMap((gap) =>
    gap.steps.map((step, rank) => ({
      key: step.id,
      skillName: gap.skill.name,
      severity: Number(gap.severity),
      rankInGap: rank,
      durationMin: step.durationMin,
    })),
  );
  const solved = solvePlan(plannable, budgetMin);
  const scheduled = new Map(solved.steps.map((s) => [s.key, s]));

  const view: LearningGapView[] = gaps.map((gap) => ({
    id: gap.id,
    skillName: gap.skill.name,
    skillSlug: gap.skill.slug,
    severity: Number(gap.severity),
    evidenceBucket: gap.evidenceBucket,
    userLevel: gap.userLevel,
    requiredLevel: gap.requiredLevel,
    targetLevel: gap.targetLevel,
    mentionCount: gap.mentionCount,
    note: gap.note,
    whyItMatters: gap.whyItMatters,
    jdQuote: gap.jdQuote,
    unlocksBullet:
      gap.unlocksBullet && gap.unlocksBulletDraft
        ? { id: gap.unlocksBullet.id, text: gap.unlocksBullet.text, draft: gap.unlocksBulletDraft }
        : null,
    answersQuestion: gap.answersQuestion
      ? { id: gap.answersQuestion.id, text: gap.answersQuestion.text }
      : null,
    // A stored fallback wins; otherwise a gap whose every step was deferred out
    // of the budget still deserves somewhere to go, so the roadmap stands in.
    fallback:
      gap.fallbackUrl && gap.fallbackLabel
        ? { url: gap.fallbackUrl, label: gap.fallbackLabel }
        : gap.steps.length === 0
          ? roadmapFallback(gap.skill.name)
          : null,
    steps: gap.steps.map((step) => {
      const placed = scheduled.get(step.id);
      return {
        id: step.id,
        courseId: step.course.id,
        title: step.course.title,
        provider: step.course.provider,
        author: step.course.author,
        mark: step.course.mark,
        url: step.course.url,
        entryUrl: step.entryUrl,
        entryLabel: step.entryLabel,
        priceLabel: step.course.priceLabel,
        isFree: step.course.isFree,
        durationMin: step.durationMin,
        note: step.note,
        order: placed?.order ?? step.ordinal,
        startsAtMin: placed?.startsAtMin ?? step.startsAtMin,
        deferred: !placed,
      };
    }),
  }));

  return {
    opening: plan?.opening ?? "",
    sequenceNote: plan?.sequenceNote ?? "",
    budgetMin,
    totalMin: solved.totalMin,
    fallbackCount: view.filter((g) => g.fallback).length,
    gaps: view,
  };
}

function roadmapFallback(skillName: string): { url: string; label: string } | null {
  const url = roadmapUrl(skillName);
  if (!url) return null;
  return {
    url,
    label: "Curated material for this topic is still being added — start with the roadmap",
  };
}

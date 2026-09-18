import "server-only";
import { db } from "@/lib/db";
import { compileRoadmap, roadmapProgress, type CompileRoadmapInput } from "@/lib/domain/roadmap";
import type { RoadmapItemKind, RoadmapSection } from "@/lib/generated/prisma/enums";

/**
 * The roadmap's read path (F21).
 *
 * Deliberately does NOT reuse `getLearningPlan`'s budget-solved step view:
 * that re-solves a knapsack against whatever budget the Learning tab is
 * showing right now, and a roadmap item is a permanent row a user may have
 * already ticked. Every learning step the plan produced gets its own item
 * regardless of today's budget — the roadmap is a record of the plan, not a
 * live view of it.
 */
export async function buildCompileInput(
  clerkUserId: string,
  analysisId: string,
): Promise<CompileRoadmapInput> {
  const [questions, gaps, savedJob] = await Promise.all([
    db.interviewQuestion.findMany({
      where: { clerkUserId, analysisId },
      select: { id: true, text: true, type: true, likely: true },
    }),
    db.skillGap.findMany({
      where: { clerkUserId, analysisId },
      select: {
        id: true,
        skill: { select: { name: true } },
        steps: {
          select: { id: true, ordinal: true, entryLabel: true, course: { select: { title: true } } },
        },
      },
    }),
    db.savedJob.findFirst({
      where: { clerkUserId, analysisId },
      select: { id: true, listing: { select: { title: true, company: true } } },
    }),
  ]);

  const learningSteps = gaps.flatMap((gap) =>
    gap.steps.map((step) => ({
      id: step.id,
      gapId: gap.id,
      ordinal: step.ordinal,
      courseTitle: step.course.title,
      entryLabel: step.entryLabel,
    })),
  );

  const fallbackGaps = gaps
    .filter((gap) => gap.steps.length === 0)
    .map((gap) => ({ id: gap.id, skillName: gap.skill.name }));

  return {
    questions: questions.map((q) => ({ id: q.id, text: q.text, type: q.type, likely: q.likely })),
    learningSteps,
    fallbackGaps,
    savedJob: savedJob ? { id: savedJob.id, title: savedJob.listing.title, company: savedJob.listing.company } : null,
  };
}

export interface RoadmapItemView {
  id: string;
  key: string;
  section: RoadmapSection;
  ordinal: number;
  label: string;
  kind: RoadmapItemKind;
  doneAt: Date | null;
  /** Where a click on this item should go. Null for a fixed step with no target. */
  href: string | null;
}

export interface RoadmapView {
  id: string;
  createdAt: Date;
  items: RoadmapItemView[];
  progress: { done: number; total: number };
}

export async function getRoadmap(
  clerkUserId: string,
  analysisId: string,
): Promise<RoadmapView | null> {
  const roadmap = await db.roadmap.findFirst({
    where: { clerkUserId, analysisId },
    select: {
      id: true,
      createdAt: true,
      items: {
        orderBy: { ordinal: "asc" },
        select: {
          id: true,
          key: true,
          section: true,
          ordinal: true,
          label: true,
          kind: true,
          doneAt: true,
          questionId: true,
          learningStepId: true,
          gapId: true,
          savedJobId: true,
        },
      },
    },
  });
  if (!roadmap) return null;

  const items: RoadmapItemView[] = roadmap.items.map((item) => ({
    id: item.id,
    key: item.key,
    section: item.section,
    ordinal: item.ordinal,
    label: item.label,
    kind: item.kind,
    doneAt: item.doneAt,
    href: hrefFor(analysisId, item),
  }));

  return {
    id: roadmap.id,
    createdAt: roadmap.createdAt,
    items,
    progress: roadmapProgress(roadmap.items),
  };
}

function hrefFor(
  analysisId: string,
  item: { kind: RoadmapItemKind; questionId: string | null; learningStepId: string | null; gapId: string | null },
): string | null {
  switch (item.kind) {
    case "question":
    case "answer":
      return item.questionId ? `/analysis/${analysisId}/prep#q-${item.questionId}` : null;
    case "learning_step":
    case "gap":
      return `/analysis/${analysisId}/learning`;
    case "saved_job":
      return "/jobs";
    default:
      return null;
  }
}

/** Whether a roadmap already exists — the tab count reads this even before it's built. */
export async function roadmapExists(clerkUserId: string, analysisId: string): Promise<boolean> {
  const row = await db.roadmap.findFirst({ where: { clerkUserId, analysisId }, select: { id: true } });
  return row !== null;
}

/** Build once, compiled fresh from the rows that exist right now (RM-4). */
export async function createRoadmap(clerkUserId: string, analysisId: string): Promise<string> {
  const input = await buildCompileInput(clerkUserId, analysisId);
  const drafts = compileRoadmap(input);

  const roadmap = await db.roadmap.create({
    data: {
      clerkUserId,
      analysisId,
      items: {
        create: drafts.map((d) => ({
          clerkUserId,
          key: d.key,
          section: d.section,
          ordinal: d.ordinal,
          label: d.label,
          kind: d.kind,
          questionId: d.questionId,
          learningStepId: d.learningStepId,
          gapId: d.gapId,
          savedJobId: d.savedJobId,
        })),
      },
    },
    select: { id: true },
  });

  return roadmap.id;
}

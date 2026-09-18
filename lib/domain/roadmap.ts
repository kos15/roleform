/**
 * The roadmap compiler (F21). PURE — no I/O, no model call (N13).
 *
 * A roadmap is not written by anything: it is compiled once, on demand, from
 * rows the analysis already holds. Every non-fixed item traces to exactly one
 * of those rows (RM-2), and a section with nothing to put in it is simply
 * never emitted — never padded (specs §13). Completion (`done_at`) is not
 * this module's business at all; it is written only by the user's own tick
 * (N15), at the database layer this module never touches.
 */

export type RoadmapSection = "prepare" | "rehearse" | "deepen" | "learn" | "apply";
export type RoadmapItemKind = "fixed" | "question" | "answer" | "learning_step" | "gap" | "saved_job";

export interface RoadmapItemDraft {
  key: string;
  section: RoadmapSection;
  ordinal: number;
  label: string;
  kind: RoadmapItemKind;
  questionId: string | null;
  learningStepId: string | null;
  gapId: string | null;
  savedJobId: string | null;
}

export interface CompileQuestion {
  id: string;
  text: string;
  type: "behavioral" | "technical" | "situational" | "gap" | "culture" | "system_design";
  likely: boolean;
}

export interface CompileLearningStep {
  id: string;
  gapId: string;
  ordinal: number;
  courseTitle: string;
  entryLabel: string | null;
}

/** A gap whose every step was deferred or that never had one — only the roadmap fallback applies. */
export interface CompileFallbackGap {
  id: string;
  skillName: string;
}

export interface CompileRoadmapInput {
  questions: CompileQuestion[];
  learningSteps: CompileLearningStep[];
  fallbackGaps: CompileFallbackGap[];
  /** The listing this analysis started from, if any (F22 hand-off, M11). */
  savedJob: { id: string; title: string; company: string } | null;
}

/**
 * Truncates a label to a length a checklist row can hold without wrapping
 * three lines. Never used on anything that becomes a claim — only on a
 * snapshot of the user's own text, purely for layout.
 */
function short(text: string, max = 90): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

export function compileRoadmap(input: CompileRoadmapInput): RoadmapItemDraft[] {
  const items: RoadmapItemDraft[] = [];
  let ordinal = 0;

  /* -------------------------------------------------------------- Prepare */
  const prepareSteps: Array<{ key: string; label: string }> = [
    { key: "prepare-buckets", label: "Read the coverage buckets — what's evidenced, partial and not" },
    { key: "prepare-template", label: "Pick a template from the Résumés tab" },
    { key: "prepare-download", label: "Download the résumé" },
  ];
  for (const step of prepareSteps) {
    items.push({
      key: step.key,
      section: "prepare",
      ordinal: ordinal++,
      label: step.label,
      kind: "fixed",
      questionId: null,
      learningStepId: null,
      gapId: null,
      savedJobId: null,
    });
  }

  /* ------------------------------------------------------------- Rehearse */
  const likely = input.questions.filter((q) => q.likely);
  for (const q of likely) {
    items.push({
      key: `rehearse-${q.id}`,
      section: "rehearse",
      ordinal: ordinal++,
      label: `Rehearse: ${short(q.text)}`,
      kind: "question",
      questionId: q.id,
      learningStepId: null,
      gapId: null,
      savedJobId: null,
    });
  }

  /* --------------------------------------------------------------- Deepen */
  const deep = input.questions.filter((q) => q.type === "technical" || q.type === "system_design");
  for (const q of deep) {
    items.push({
      key: `deepen-${q.id}`,
      section: "deepen",
      ordinal: ordinal++,
      label: `Draft the worked answer: ${short(q.text)}`,
      kind: "answer",
      questionId: q.id,
      learningStepId: null,
      gapId: null,
      savedJobId: null,
    });
  }

  /* ----------------------------------------------------------------- Learn */
  const sortedSteps = [...input.learningSteps].sort((a, b) => a.ordinal - b.ordinal);
  for (const step of sortedSteps) {
    const label = step.entryLabel
      ? `Complete: ${short(step.courseTitle, 70)} · ${short(step.entryLabel, 20)}`
      : `Complete: ${short(step.courseTitle)}`;
    items.push({
      key: `learn-step-${step.id}`,
      section: "learn",
      ordinal: ordinal++,
      label,
      kind: "learning_step",
      questionId: null,
      learningStepId: step.id,
      gapId: null,
      savedJobId: null,
    });
  }
  for (const gap of input.fallbackGaps) {
    items.push({
      key: `learn-gap-${gap.id}`,
      section: "learn",
      ordinal: ordinal++,
      label: `Read the roadmap node for ${short(gap.skillName, 50)}`,
      kind: "gap",
      questionId: null,
      learningStepId: null,
      gapId: gap.id,
      savedJobId: null,
    });
  }

  /* ---------------------------------------------------------------- Apply */
  items.push({
    key: "apply-submit",
    section: "apply",
    ordinal: ordinal++,
    label: input.savedJob
      ? `Apply to ${short(input.savedJob.title, 40)} at ${short(input.savedJob.company, 30)}`
      : "Apply",
    kind: input.savedJob ? "saved_job" : "fixed",
    questionId: null,
    learningStepId: null,
    gapId: null,
    savedJobId: input.savedJob?.id ?? null,
  });
  items.push({
    key: "apply-follow-up",
    section: "apply",
    ordinal: ordinal++,
    label: "Follow up after a week",
    kind: "fixed",
    questionId: null,
    learningStepId: null,
    gapId: null,
    savedJobId: null,
  });

  return items;
}

export interface RoadmapProgress {
  done: number;
  total: number;
}

/** `n of m`. Never a percentage, never "ready" (N16). */
export function roadmapProgress(items: Array<{ doneAt: Date | null }>): RoadmapProgress {
  return { done: items.filter((i) => i.doneAt !== null).length, total: items.length };
}

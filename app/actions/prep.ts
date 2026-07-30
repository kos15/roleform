"use server";

import { db } from "@/lib/db";
import { checkAnswerAllowance, requireUser } from "@/lib/auth";
import { rateLimit, LIMITS } from "@/lib/rate-limit";
import { generateAnswer } from "@/lib/ai/answer";
import {
  getAnalysis,
  getCatalog,
  getQuestion,
  parseAnswerRow,
  type StoredAnswer,
} from "@/lib/db/queries/analysis";
import { getBullets, getProfile, toDomainBullets } from "@/lib/db/queries/profile";
import { matchCoursesForConcepts } from "@/lib/catalog/match";
import { appError, err, ok, type Result } from "@/lib/domain/types";
import type { AnswerView } from "@/app/(app)/analysis/[id]/prep/types";

/**
 * Drafting a worked answer (F7.2).
 *
 * On demand, one question at a time, and cached in `question_answers` after the
 * first run — a full analysis already makes a dozen model calls, and putting
 * twelve more on its critical path would buy latency for a surface most users
 * open once. The mid tier does the writing (lib/ai/answer.ts explains why).
 *
 * Idempotent: a second click returns the stored row rather than paying again.
 */
export async function draftAnswer(questionId: string): Promise<Result<AnswerView>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const question = await getQuestion(user.value, questionId);
  if (!question) return err(appError("not_found", "We couldn't find that question."));

  const existing = await db.questionAnswer.findFirst({
    where: { clerkUserId: user.value, questionId },
  });
  if (existing) {
    const parsed = parseAnswerRow(existing);
    if (parsed) return ok(await withCourses(parsed, user.value));
    // A row that no longer parses is stale, not sacred. Replace it below.
    await db.questionAnswer.delete({ where: { id: existing.id } });
  }

  const limited = rateLimit(
    `answer:${user.value}`,
    LIMITS.answer.limit,
    LIMITS.answer.windowSeconds,
  );
  if (!limited.allowed) {
    return err(
      appError(
        "invalid_input",
        `That's a lot of answers at once. Try again in ${limited.retryAfterSeconds}s.`,
      ),
    );
  }

  // The answers cap (F15). Checked after the cache lookup above on purpose: a
  // question you have already had drafted stays readable at any cap, because
  // re-reading it costs nothing and taking it away would be a punishment
  // rather than a limit.
  const allowance = await checkAnswerAllowance(user.value);
  if (!allowance.ok) return allowance;

  const [analysis, profile] = await Promise.all([
    getAnalysis(user.value, question.analysisId),
    getProfile(user.value),
  ]);
  if (!analysis || !profile) {
    return err(appError("not_found", "We couldn't find the analysis this question belongs to."));
  }

  const bullets = toDomainBullets(await getBullets(user.value, profile.id));
  const cited = new Set(question.evidenceBulletIds);

  const requirement = question.sourceRequirementId
    ? await db.jdRequirement.findFirst({
        where: { clerkUserId: user.value, id: question.sourceRequirementId },
        select: { text: true },
      })
    : null;

  const generated = await generateAnswer({
    clerkUserId: user.value,
    analysisId: question.analysisId,
    jobTitle: analysis.title ?? "this role",
    company: analysis.company ?? "",
    seniority: analysis.seniority,
    question: {
      type: question.type,
      text: question.text,
      whyTheyAsk: question.whyTheyAsk,
      frame: question.frame,
    },
    evidenceBullets: bullets.filter((b) => cited.has(b.id)),
    otherBullets: bullets.filter((b) => !cited.has(b.id)),
    requirementText: requirement?.text ?? null,
  });
  if (!generated.ok) return generated;

  const { answer, aiRunId } = generated.value;

  // upsert, not create: two tabs racing the same question would otherwise
  // collide on question_id's unique index and surface as a 500.
  const row = await db.questionAnswer.upsert({
    where: { questionId },
    create: {
      clerkUserId: user.value,
      questionId,
      analysisId: question.analysisId,
      headline: answer.headline,
      sections: answer.sections,
      resumeHooks: answer.resumeHooks,
      followUps: answer.followUps,
      keyConcepts: answer.keyConcepts,
      aiRunId,
    },
    update: {
      headline: answer.headline,
      sections: answer.sections,
      resumeHooks: answer.resumeHooks,
      followUps: answer.followUps,
      keyConcepts: answer.keyConcepts,
      aiRunId,
    },
  });

  const parsed = parseAnswerRow(row);
  if (!parsed) return err(appError("schema_invalid", "That answer came back malformed."));

  return ok(await withCourses(parsed, user.value));
}

/**
 * Resolves a stored answer into what the screen renders: every hook carries the
 * bullet it derives from, so the provenance is visible rather than promised.
 */
async function withCourses(answer: StoredAnswer, clerkUserId: string): Promise<AnswerView> {
  const bulletIds = [...new Set(answer.resumeHooks.map((h) => h.bulletId))];

  const [bulletRows, catalog] = await Promise.all([
    bulletIds.length > 0
      ? db.experienceBullet.findMany({
          where: { clerkUserId, id: { in: bulletIds } },
          select: { id: true, text: true },
        })
      : Promise.resolve([]),
    getCatalog(),
  ]);

  const textById = new Map(bulletRows.map((r) => [r.id, r.text]));

  return {
    headline: answer.headline,
    sections: answer.sections,
    resumeHooks: answer.resumeHooks
      .map((h) => ({ useIt: h.useIt, sourceText: textById.get(h.bulletId) ?? "" }))
      // A hook whose bullet no longer exists has lost its provenance. Drop it
      // rather than render a first-person claim with nothing behind it (N1).
      .filter((h) => h.sourceText.length > 0),
    followUps: answer.followUps,
    keyConcepts: answer.keyConcepts,
    courses: matchCoursesForConcepts(answer.keyConcepts, catalog).map((c) => ({
      id: c.id,
      title: c.title,
      provider: c.provider,
      url: c.url,
      mark: c.mark,
      priceLabel: c.priceLabel,
      isFree: c.isFree,
    })),
  };
}

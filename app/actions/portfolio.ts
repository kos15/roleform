"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { checkTokenAllowance, requireUser } from "@/lib/auth";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { getAnalysis, getRequirements } from "@/lib/db/queries/analysis";
import { getProfile } from "@/lib/db/queries/profile";
import { StoredResumeSchema } from "@/lib/ai/schemas/resume-json";
import { PortfolioChoicesSchema } from "@/lib/ai/schemas/portfolio";
import { buildPortfolioSite } from "@/lib/ai/portfolio";
import { portfolioMaterials } from "@/lib/domain/portfolio";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/**
 * F28 — the in-app portfolio build. One per account, ever.
 *
 * Order matters, and every step before the model call is free:
 *   1. the trial — a ready row means it is used; a recent `building` row means
 *      another tab is mid-build; a stale one (the function died) is cleared;
 *   2. the burst limit, then the token meter (F19) — refused before anything
 *      is reserved, so a wall never costs the trial;
 *   3. the reservation — an insert against the UNIQUE key, so two tabs racing
 *      past step 1 cannot both reach the model;
 *   4. the call. A failure deletes the reservation: the trial is spent only by
 *      a page the member actually receives.
 *
 * The curated prompt needs no action at all: it is assembled on the page
 * from data the page already holds.
 */

/** Longer than any healthy build (the call times out at 4 minutes). */
const STALE_BUILD_MS = 10 * 60 * 1000;

export async function buildPortfolio(
  analysisId: string,
  rawChoices: unknown,
): Promise<Result<{ html: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const choices = PortfolioChoicesSchema.safeParse(rawChoices);
  if (!choices.success) return err(appError("invalid_input", "Some of those answers aren't valid."));

  const existing = await db.portfolioSite.findUnique({ where: { clerkUserId: user.value } });
  if (existing?.status === "ready") {
    return err(appError("quota_exhausted", "Your one portfolio build is already used. Use the curated prompt to make more versions."));
  }
  if (existing?.status === "building") {
    if (Date.now() - existing.updatedAt.getTime() < STALE_BUILD_MS) {
      return err(appError("invalid_input", "Your portfolio is already being built. Give it a minute."));
    }
    await db.portfolioSite.delete({ where: { id: existing.id } });
  }

  const [analysis, profile] = await Promise.all([getAnalysis(user.value, analysisId), getProfile(user.value)]);
  if (!analysis || analysis.status !== "ready") return err(appError("not_found", "We couldn't find that analysis."));
  if (!profile) return err(appError("not_found", "Import your résumé first."));
  const resume = StoredResumeSchema.safeParse(profile.resumeJson);
  if (!resume.success) return err(appError("invalid_input", "Your profile needs a save before it can be used."));

  const limited = rateLimit(`portfolio:${user.value}`, LIMITS.portfolio.limit, LIMITS.portfolio.windowSeconds);
  if (!limited.allowed) {
    return err(appError("invalid_input", `That's a lot at once. Try again in ${limited.retryAfterSeconds}s.`));
  }
  const tokens = await checkTokenAllowance(user.value, "portfolio");
  if (!tokens.ok) return tokens;

  let reservationId: string;
  try {
    const row = await db.portfolioSite.create({
      data: {
        clerkUserId: user.value,
        masterProfileId: profile.id,
        analysisId,
        choices: choices.data,
      },
      select: { id: true },
    });
    reservationId = row.id;
  } catch {
    // The UNIQUE key: another tab reserved first.
    return err(appError("invalid_input", "Your portfolio is already being built. Give it a minute."));
  }

  const requirements = await getRequirements(user.value, analysisId);
  const materials = portfolioMaterials(resume.data, {
    title: analysis.title,
    company: analysis.company,
    requirements,
  });

  const built = await buildPortfolioSite({
    clerkUserId: user.value,
    analysisId,
    materials,
    choices: choices.data,
  });
  if (!built.ok) {
    await db.portfolioSite.delete({ where: { id: reservationId } }).catch(() => undefined);
    return err({
      ...built.error,
      message: `${built.error.message} Your build wasn't used — you can try again.`,
    });
  }

  await db.portfolioSite.update({
    where: { id: reservationId },
    data: { status: "ready", html: built.value.html, aiRunId: built.value.aiRunId },
  });
  revalidatePath(`/analysis/${analysisId}/portfolio`);
  return ok({ html: built.value.html });
}

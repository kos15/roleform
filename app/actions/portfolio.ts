"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { getAnalysis, getRequirements } from "@/lib/db/queries/analysis";
import { getProfile } from "@/lib/db/queries/profile";
import { StoredResumeSchema } from "@/lib/ai/schemas/resume-json";
import { PortfolioChoicesSchema } from "@/lib/ai/schemas/portfolio";
import { portfolioMaterials } from "@/lib/domain/portfolio";
import { siteData } from "@/lib/domain/portfolio-site";
import { exportPortfolioHtml } from "@/lib/render/portfolio/export";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/**
 * F28 — the in-app portfolio build. One per account, ever. No model call
 * (N12/N13 spirit: a pure render needs none): the page is the chosen look
 * rendered from the profile excerpt, so nothing is metered and nothing on it
 * is written by anyone but the member.
 *
 * The row records the trial and keeps a photo-less copy of the page (the
 * `html` CHECK). The file the member downloads is rendered in their browser,
 * where their photos live — photos never reach the server.
 *
 * The curated prompt needs no action at all: it is assembled on the page.
 */
export async function buildPortfolio(analysisId: string, rawChoices: unknown): Promise<Result<{ html: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const choices = PortfolioChoicesSchema.safeParse(rawChoices);
  if (!choices.success) return err(appError("invalid_input", "Some of those answers aren't valid."));

  const existing = await db.portfolioSite.findUnique({ where: { clerkUserId: user.value } });
  if (existing?.status === "ready") {
    return err(appError("quota_exhausted", "Your one portfolio build is already used. Use the curated prompt to make more versions."));
  }
  // A `building` row is left over from the model-call era; it holds nothing.
  if (existing) await db.portfolioSite.delete({ where: { id: existing.id } });

  const [analysis, profile] = await Promise.all([getAnalysis(user.value, analysisId), getProfile(user.value)]);
  if (!analysis || analysis.status !== "ready") return err(appError("not_found", "We couldn't find that analysis."));
  if (!profile) return err(appError("not_found", "Import your résumé first."));
  const resume = StoredResumeSchema.safeParse(profile.resumeJson);
  if (!resume.success) return err(appError("invalid_input", "Your profile needs a save before it can be used."));

  const limited = rateLimit(`portfolio:${user.value}`, LIMITS.portfolio.limit, LIMITS.portfolio.windowSeconds);
  if (!limited.allowed) {
    return err(appError("invalid_input", `That's a lot at once. Try again in ${limited.retryAfterSeconds}s.`));
  }

  const requirements = await getRequirements(user.value, analysisId);
  const materials = portfolioMaterials(resume.data, {
    title: analysis.title,
    company: analysis.company,
    requirements,
  });
  const c = choices.data;
  const html = exportPortfolioHtml(siteData(materials), {
    theme: c.style,
    focus: materials.target ? c.focus : "broad",
    showEmail: c.showEmail && Boolean(materials.email),
    showPhone: c.showPhone && Boolean(materials.phone),
    showLinks: c.showLinks && materials.links.length > 0,
    photos: {},
  });

  try {
    await db.portfolioSite.create({
      data: {
        clerkUserId: user.value,
        masterProfileId: profile.id,
        analysisId,
        choices: c,
        status: "ready",
        html,
      },
    });
  } catch {
    // The UNIQUE key: another tab built first.
    return err(appError("quota_exhausted", "Your one portfolio build is already used. Use the curated prompt to make more versions."));
  }

  revalidatePath(`/analysis/${analysisId}/portfolio`);
  return ok({ html });
}

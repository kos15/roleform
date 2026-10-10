import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getAnalysis, getRequirements } from "@/lib/db/queries/analysis";
import { getProfile } from "@/lib/db/queries/profile";
import { StoredResumeSchema } from "@/lib/ai/schemas/resume-json";
import { PortfolioChoicesSchema, DEFAULT_CHOICES } from "@/lib/ai/schemas/portfolio";
import { portfolioMaterials } from "@/lib/domain/portfolio";
import { PORTFOLIO_ESTIMATE } from "@/lib/domain/tokens";
import { EmptyState } from "@/components/ui";
import { PortfolioStudio } from "./portfolio-studio";

/**
 * F28 — portfolio site, reached from the promo card on the Resumes tab.
 *
 * Two ways out, one set of answers: copy a curated prompt (free, no model
 * call, as many times as they like) or build the page here (one metered call,
 * once per account).
 */

/** The build is one long call (up to four minutes at the strong tier). */
export const maxDuration = 300;

export default async function PortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/");

  const [analysis, profile, requirements, site] = await Promise.all([
    getAnalysis(userId, id),
    getProfile(userId),
    getRequirements(userId, id),
    db.portfolioSite.findUnique({ where: { clerkUserId: userId } }),
  ]);
  if (!analysis) redirect("/history");
  if (analysis.status !== "ready") redirect(`/analysis/${id}`);
  if (!profile) redirect("/onboarding");

  const resume = StoredResumeSchema.safeParse(profile.resumeJson);
  if (!resume.success) {
    return (
      <EmptyState title="Your profile needs a save first">
        Open <Link href="/profile">your profile</Link>, check it and save — then come back here.
      </EmptyState>
    );
  }

  const materials = portfolioMaterials(resume.data, {
    title: analysis.title,
    company: analysis.company,
    requirements,
  });
  const savedChoices = PortfolioChoicesSchema.safeParse(site?.choices);

  return (
    <PortfolioStudio
      analysisId={id}
      materials={materials}
      estimate={PORTFOLIO_ESTIMATE}
      initialChoices={savedChoices.success ? savedChoices.data : DEFAULT_CHOICES}
      site={
        site?.status === "ready" && site.html
          ? { html: site.html, builtFor: site.analysisId === id ? "this posting" : "another posting", createdAt: site.createdAt.toISOString() }
          : null
      }
      building={site?.status === "building"}
    />
  );
}

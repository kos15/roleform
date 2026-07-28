import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  analyses,
  coverageItems,
  courses,
  experienceBullets,
  interviewQuestions,
  jdRequirements,
  masterProfiles,
  resumeDrafts,
  skillGaps,
  skills,
  tailoredBullets,
} from "@/lib/db/schema";
import type { DomainCoverageItem, DomainRequirement } from "@/lib/domain/types";
import type { MatchableCourse } from "@/lib/catalog/match";

/** Every query scopes by clerkUserId. See queries/profile.ts for why. */

export async function listAnalyses(clerkUserId: string, limit = 50) {
  return db
    .select({
      id: analyses.id,
      company: analyses.company,
      title: analyses.title,
      score: analyses.score,
      status: analyses.status,
      createdAt: analyses.createdAt,
    })
    .from(analyses)
    .where(eq(analyses.clerkUserId, clerkUserId))
    .orderBy(desc(analyses.createdAt))
    .limit(limit);
}

export async function findByContentHash(clerkUserId: string, contentHash: string) {
  const [row] = await db
    .select()
    .from(analyses)
    .where(and(eq(analyses.clerkUserId, clerkUserId), eq(analyses.contentHash, contentHash)));
  return row ?? null;
}

export async function getAnalysis(clerkUserId: string, analysisId: string) {
  const [row] = await db
    .select()
    .from(analyses)
    .where(and(eq(analyses.clerkUserId, clerkUserId), eq(analyses.id, analysisId)));
  return row ?? null;
}

export async function getRequirements(
  clerkUserId: string,
  analysisId: string,
): Promise<DomainRequirement[]> {
  const rows = await db
    .select({
      id: jdRequirements.id,
      kind: jdRequirements.kind,
      text: jdRequirements.text,
      necessity: jdRequirements.necessity,
      mentionCount: jdRequirements.mentionCount,
      evidenceQuote: jdRequirements.evidenceQuote,
      skillName: skills.name,
    })
    .from(jdRequirements)
    .leftJoin(skills, eq(skills.id, jdRequirements.skillId))
    .where(
      and(
        eq(jdRequirements.clerkUserId, clerkUserId),
        eq(jdRequirements.analysisId, analysisId),
      ),
    );
  return rows.map((r) => ({ ...r, skillName: r.skillName ?? null }));
}

export async function getCoverage(
  clerkUserId: string,
  analysisId: string,
): Promise<DomainCoverageItem[]> {
  const rows = await db
    .select()
    .from(coverageItems)
    .where(
      and(eq(coverageItems.clerkUserId, clerkUserId), eq(coverageItems.analysisId, analysisId)),
    );
  return rows.map((r) => ({
    requirementId: r.requirementId,
    status: r.status,
    evidenceBulletIds: r.evidenceBulletIds,
    rationale: r.rationale,
  }));
}

export async function getBulletTexts(
  clerkUserId: string,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: experienceBullets.id, text: experienceBullets.text })
    .from(experienceBullets)
    .where(
      and(eq(experienceBullets.clerkUserId, clerkUserId), inArray(experienceBullets.id, ids)),
    );
  return new Map(rows.map((r) => [r.id, r.text]));
}

export async function getDrafts(clerkUserId: string, analysisId: string) {
  return db
    .select()
    .from(resumeDrafts)
    .where(and(eq(resumeDrafts.clerkUserId, clerkUserId), eq(resumeDrafts.analysisId, analysisId)));
}

export async function getDraft(clerkUserId: string, draftId: string) {
  const [row] = await db
    .select()
    .from(resumeDrafts)
    .where(and(eq(resumeDrafts.clerkUserId, clerkUserId), eq(resumeDrafts.id, draftId)));
  return row ?? null;
}

export async function getTailoredBullets(clerkUserId: string, draftId: string) {
  return db
    .select()
    .from(tailoredBullets)
    .where(and(eq(tailoredBullets.clerkUserId, clerkUserId), eq(tailoredBullets.draftId, draftId)))
    .orderBy(tailoredBullets.ordinal);
}

export async function getQuestions(clerkUserId: string, analysisId: string) {
  return db
    .select()
    .from(interviewQuestions)
    .where(
      and(
        eq(interviewQuestions.clerkUserId, clerkUserId),
        eq(interviewQuestions.analysisId, analysisId),
      ),
    )
    .orderBy(interviewQuestions.ordinal);
}

export async function getGaps(clerkUserId: string, analysisId: string) {
  return db
    .select({
      id: skillGaps.id,
      skillId: skillGaps.skillId,
      skillName: skills.name,
      userLevel: skillGaps.userLevel,
      requiredLevel: skillGaps.requiredLevel,
      mentionCount: skillGaps.mentionCount,
      note: skillGaps.note,
    })
    .from(skillGaps)
    .innerJoin(skills, eq(skills.id, skillGaps.skillId))
    .where(and(eq(skillGaps.clerkUserId, clerkUserId), eq(skillGaps.analysisId, analysisId)))
    // F8: ordered by how often the posting mentions them — the honest proxy for
    // what the employer cares about, and it comes free from JD analysis.
    .orderBy(desc(skillGaps.mentionCount));
}

export async function getProfileById(clerkUserId: string, profileId: string) {
  const [row] = await db
    .select()
    .from(masterProfiles)
    .where(and(eq(masterProfiles.clerkUserId, clerkUserId), eq(masterProfiles.id, profileId)));
  return row ?? null;
}

/** The curated catalog, shaped for the pure matcher. */
export async function getCatalog(): Promise<MatchableCourse[]> {
  const rows = await db.select().from(courses);
  const skillRows = await db.select({ id: skills.id, name: skills.name }).from(skills);
  const nameById = new Map(skillRows.map((s) => [s.id, s.name]));
  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    provider: c.provider,
    url: c.url,
    mark: c.mark,
    priceLabel: c.priceLabel,
    lengthLabel: c.lengthLabel,
    lengthMinutes: c.lengthMinutes,
    level: c.level,
    isFree: c.isFree,
    skillNames: c.skillIds.map((id) => nameById.get(id) ?? "").filter(Boolean),
  }));
}

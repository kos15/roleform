import "server-only";
import { db } from "@/lib/db";
import type { DomainCoverageItem, DomainRequirement } from "@/lib/domain/types";
import type { MatchableCourse } from "@/lib/catalog/match";

/** Every query scopes by clerkUserId. See queries/profile.ts for why. */

export async function listAnalyses(clerkUserId: string, limit = 50) {
  return db.analysis.findMany({
    where: { clerkUserId },
    select: { id: true, company: true, title: true, score: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function findByContentHash(clerkUserId: string, contentHash: string) {
  return db.analysis.findFirst({ where: { clerkUserId, contentHash } });
}

export async function getAnalysis(clerkUserId: string, analysisId: string) {
  return db.analysis.findFirst({ where: { clerkUserId, id: analysisId } });
}

export async function getRequirements(
  clerkUserId: string,
  analysisId: string,
): Promise<DomainRequirement[]> {
  const rows = await db.jdRequirement.findMany({
    where: { clerkUserId, analysisId },
    include: { skill: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    text: r.text,
    necessity: r.necessity,
    mentionCount: r.mentionCount,
    evidenceQuote: r.evidenceQuote,
    skillName: r.skill?.name ?? null,
  }));
}

export async function getCoverage(
  clerkUserId: string,
  analysisId: string,
): Promise<DomainCoverageItem[]> {
  const rows = await db.coverageItem.findMany({ where: { clerkUserId, analysisId } });
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
  const rows = await db.experienceBullet.findMany({
    where: { clerkUserId, id: { in: ids } },
    select: { id: true, text: true },
  });
  return new Map(rows.map((r) => [r.id, r.text]));
}

export async function getDrafts(clerkUserId: string, analysisId: string) {
  return db.resumeDraft.findMany({ where: { clerkUserId, analysisId } });
}

export async function getDraft(clerkUserId: string, draftId: string) {
  return db.resumeDraft.findFirst({ where: { clerkUserId, id: draftId } });
}

export async function getTailoredBullets(clerkUserId: string, draftId: string) {
  return db.tailoredBullet.findMany({
    where: { clerkUserId, draftId },
    orderBy: { ordinal: "asc" },
  });
}

export async function getQuestions(clerkUserId: string, analysisId: string) {
  return db.interviewQuestion.findMany({
    where: { clerkUserId, analysisId },
    orderBy: { ordinal: "asc" },
  });
}

export async function getGaps(clerkUserId: string, analysisId: string) {
  const rows = await db.skillGap.findMany({
    where: { clerkUserId, analysisId },
    include: { skill: { select: { name: true } } },
    // F8: ordered by how often the posting mentions them — the honest proxy for
    // what the employer cares about, and it comes free from JD analysis.
    orderBy: { mentionCount: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    skillId: r.skillId,
    skillName: r.skill.name,
    userLevel: r.userLevel,
    requiredLevel: r.requiredLevel,
    mentionCount: r.mentionCount,
    note: r.note,
  }));
}

export async function getProfileById(clerkUserId: string, profileId: string) {
  return db.masterProfile.findFirst({ where: { clerkUserId, id: profileId } });
}

/** The curated catalog, shaped for the pure matcher. */
export async function getCatalog(): Promise<MatchableCourse[]> {
  const [rows, skillRows] = await Promise.all([
    db.course.findMany(),
    db.skill.findMany({ select: { id: true, name: true } }),
  ]);
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

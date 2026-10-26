import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { cycleEnd, cycleStart } from "@/lib/domain/quotas";
import { isUncapped, practiceSessionWhere } from "@/lib/domain/entitlements";

export interface CountLine {
  used: number;
  /** null when uncapped (admin). */
  cap: number | null;
  /** null when uncapped; never negative. */
  left: number | null;
}

export interface CycleCounts {
  analyses: CountLine & { bonusLeft: number };
  answers: CountLine;
  practice: CountLine;
  roadmaps: CountLine;
  jobSearches: CountLine;
  resetsAt: Date;
  suspended: boolean;
}

/**
 * What a member has used of each printed count this cycle (counts-only
 * pricing). The same reads the allowance checks in lib/services/auth.ts make, in one
 * place, for the surfaces that show counts: the account sheet, the low-count
 * banner and the profile's usage panel. Memoised per request.
 */
export const cycleCounts = cache(async function cycleCounts(clerkUserId: string): Promise<CycleCounts | null> {
  const user = await db.user.findUnique({
    where: { clerkUserId },
    select: {
      role: true,
      suspended: true,
      quotaResetsAt: true,
      capAnalyses: true,
      capAnswers: true,
      capPractice: true,
      capRoadmaps: true,
      capJobSearches: true,
    },
  });
  if (!user) return null;

  const since = cycleStart(user.quotaResetsAt);
  const practiceWhere = practiceSessionWhere(clerkUserId, since);
  const [analyses, answers, decks, rounds, challenges, roadmaps, jobSearches, granted, bonusSpent] = await Promise.all([
    db.analysis.count({ where: { clerkUserId, fromBonus: false, createdAt: { gte: since } } }),
    db.questionAnswer.count({ where: { clerkUserId, createdAt: { gte: since } } }),
    db.revisionDeck.count({ where: practiceWhere }),
    db.quizRound.count({ where: practiceWhere }),
    db.codingChallenge.count({ where: practiceWhere }),
    db.roadmap.count({ where: { clerkUserId, createdAt: { gte: since } } }),
    db.jobSearch.count({ where: { clerkUserId, createdAt: { gte: since } } }),
    db.analysisGrant.aggregate({ where: { clerkUserId }, _sum: { analyses: true } }),
    db.analysis.count({ where: { clerkUserId, fromBonus: true } }),
  ]);

  const uncapped = isUncapped(user.role);
  const line = (used: number, cap: number): CountLine =>
    uncapped ? { used, cap: null, left: null } : { used, cap, left: Math.max(0, cap - used) };

  const bonusLeft = Math.max(0, (granted._sum.analyses ?? 0) - bonusSpent);
  return {
    analyses: { ...line(analyses, user.capAnalyses), bonusLeft },
    answers: line(answers, user.capAnswers),
    practice: line(decks + rounds + challenges, user.capPractice),
    roadmaps: line(roadmaps, user.capRoadmaps),
    jobSearches: line(jobSearches, user.capJobSearches),
    resetsAt: cycleEnd(user.quotaResetsAt),
    suspended: user.suspended,
  };
});

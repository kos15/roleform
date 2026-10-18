import "server-only";
import { db } from "@/lib/db";
import type { AnalysisStatus } from "@/lib/generated/prisma/enums";

/**
 * Members' History, read by an admin (F15).
 *
 * The same rows a member's own /history lists — role, company, coverage score,
 * status, date — plus counts of what each run produced. Counts, not content:
 * the admin sees that a run made eleven drafts and twelve questions, never the
 * bullets or the posting text. Read-only, and server-side behind the admin
 * gate; nothing here is reachable by a member.
 */
export interface HistoryRow {
  id: string;
  clerkUserId: string;
  title: string | null;
  company: string | null;
  score: number | null;
  status: AnalysisStatus;
  parked: boolean;
  /** Formatted server-side so the client never hydrates a different locale. */
  createdAt: string;
  drafts: number;
  questions: number;
  gaps: number;
  exports: number;
}

/** Newest first. One member when `clerkUserId` is given, else everyone. */
export async function listHistory(args: { clerkUserId?: string; limit?: number } = {}): Promise<HistoryRow[]> {
  const rows = await db.analysis.findMany({
    where: args.clerkUserId ? { clerkUserId: args.clerkUserId } : {},
    select: {
      id: true,
      clerkUserId: true,
      title: true,
      company: true,
      score: true,
      status: true,
      queuedAt: true,
      createdAt: true,
      _count: {
        select: { resumeDrafts: true, interviewQuestions: true, skillGaps: true, exports: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: args.limit ?? 200,
  });

  return rows.map((r) => ({
    id: r.id,
    clerkUserId: r.clerkUserId,
    title: r.title,
    company: r.company,
    score: r.score === null ? null : Math.round(Number(r.score)),
    status: r.status,
    parked: r.queuedAt !== null,
    createdAt: r.createdAt.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    drafts: r._count.resumeDrafts,
    questions: r._count.interviewQuestions,
    gaps: r._count.skillGaps,
    exports: r._count.exports,
  }));
}

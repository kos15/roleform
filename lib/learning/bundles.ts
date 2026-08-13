import "server-only";
import { db } from "@/lib/db";
import type { SkillLevel } from "@/lib/generated/prisma/enums";
import type { BundledResource, ResourceType } from "@/lib/domain/selection";

/**
 * S5 — request-time retrieval, in full.
 *
 * RLE spec §7 / rag-strategy.md §8: two primary-key reads and no search. The
 * expensive half — hybrid search, reranking, diversity enforcement — already
 * ran in `pnpm bundles:rebuild`, once per (skill, level), and is read by every
 * user forever for zero tokens.
 *
 * ── The invariant this file exists to hold ──────────────────────────────────
 * I1: no LLM call in S5. I8: ingest-time work is preferred to request-time work
 * in every ambiguous case. If a future change adds an embedding call, a
 * similarity search or a rerank to this module, it breaks the cost model the
 * whole engine is built on and needs a written justification in decisions.md —
 * not a patch.
 */

/** Frozen into `skill_bundles.entry_points` at build time. Never derived here. */
interface EntryPoint {
  entryLabel: string | null;
  entryUrl: string | null;
  summary: string | null;
}

export interface BundleRequest {
  skillId: string;
  level: SkillLevel;
}

/**
 * Look up every requested bundle in two queries, whatever the number of gaps.
 *
 * Returned in the bundle's own rank order — the deterministic personalisation
 * filters (lib/domain/selection.ts) reorder within it, but the ordering they
 * start from is the precomputed one.
 *
 * A missing bundle returns an empty array rather than throwing. An empty bundle
 * is a real, expected state: it means the corpus does not cover this node yet,
 * and spec §9 has an answer for it (the roadmap fallback) that is a product
 * feature rather than a degradation.
 */
export async function lookupBundles(
  requests: BundleRequest[],
): Promise<Map<string, BundledResource[]>> {
  const out = new Map<string, BundledResource[]>();
  if (requests.length === 0) return out;

  const bundles = await db.skillBundle.findMany({
    where: { OR: requests.map((r) => ({ skillId: r.skillId, level: r.level })) },
  });
  if (bundles.length === 0) return out;

  const courseIds = [...new Set(bundles.flatMap((b) => b.rankedCourseIds))];
  const courses = await db.course.findMany({
    // OUT-1 and OUT-7 in one clause: a resource that has gone dead is excluded
    // from every bundle read the moment the verifier sweep marks it, without
    // waiting for a rebuild. A recommendation that 404s destroys more trust
    // than a missing recommendation.
    where: { id: { in: courseIds }, status: "active" },
  });
  const courseById = new Map(courses.map((c) => [c.id, c]));

  const now = Date.now();

  for (const bundle of bundles) {
    const entries = (bundle.entryPoints ?? {}) as Record<string, EntryPoint | undefined>;

    const resources: BundledResource[] = [];
    for (const courseId of bundle.rankedCourseIds) {
      const course = courseById.get(courseId);
      if (!course) continue; // dead, stale or quarantined since the last rebuild

      const entry = entries[courseId];
      resources.push({
        id: course.id,
        title: course.title,
        provider: course.provider,
        author: course.author,
        url: course.url,
        mark: course.mark,
        type: course.type as ResourceType,
        level: course.level,
        isFree: course.isFree,
        priceLabel: course.priceLabel,
        lengthLabel: course.lengthLabel,
        durationMin: course.lengthMinutes,
        ageMonths: monthsSince(course.publishedAt, now),
        summary: entry?.summary ?? null,
        entryLabel: entry?.entryLabel ?? null,
        entryUrl: entry?.entryUrl ?? null,
        tags: course.tags,
        qualityScore: Number(course.qualityScore),
      });
    }

    out.set(key(bundle.skillId, bundle.level), resources);
  }

  return out;
}

export function key(skillId: string, level: SkillLevel): string {
  return `${skillId}:${level}`;
}

/**
 * Log a (skill, level) the corpus could not serve — spec §9.
 *
 * `corpus_gaps` ranked by count IS the ingestion backlog: it says exactly what
 * to index next, ranked by demand we actually observed rather than by a
 * curator's guess. Failing to write it would make the fallback path a silent
 * degradation instead of the feedback loop it is meant to be.
 *
 * Best-effort by design. A failure here must never fail a run the user paid
 * for, so it is logged and swallowed (N7: the skill id is not user data, but
 * nothing else about the run is logged either way).
 */
export async function recordCorpusGap(skillId: string, level: SkillLevel): Promise<void> {
  try {
    await db.corpusGap.upsert({
      where: { skillId_level: { skillId, level } },
      create: { skillId, level },
      update: { count: { increment: 1 }, lastSeenAt: new Date() },
    });
  } catch (e) {
    console.error(`[learning] corpus_gap write failed error=${e instanceof Error ? e.name : "unknown"}`);
  }
}

/**
 * Park a term the resolver could not place — spec §4, tier 4.
 *
 * Ranked by frequency this table says which alias or taxonomy node to add next.
 * It carries the term and nothing else: the term is public content from a job
 * board, the pairing of a term with a person is not (guardrails.md, Privacy).
 */
export async function recordUnresolved(
  terms: Array<{ term: string; normalised: string }>,
): Promise<void> {
  if (terms.length === 0) return;

  // Deduplicate within the run first — one posting saying "Kubernetes-adjacent"
  // three times is one unmet term, not three.
  const unique = new Map(terms.map((t) => [t.normalised, t.term]));

  for (const [normalised, term] of unique) {
    if (!normalised || normalised.length < 2) continue;
    try {
      await db.unresolvedTerm.upsert({
        where: { normalised },
        create: { normalised, term },
        update: { seenCount: { increment: 1 }, lastSeenAt: new Date() },
      });
    } catch (e) {
      console.error(
        `[learning] unresolved_term write failed error=${e instanceof Error ? e.name : "unknown"}`,
      );
    }
  }
}

function monthsSince(date: Date | null, now: number): number | null {
  if (!date) return null;
  return Math.max(0, Math.round((now - date.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
}

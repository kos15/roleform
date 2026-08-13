/**
 * The bundle builder — RLE spec §7, rag-strategy.md §7.
 *
 * This is where the learning engine's cost model is actually paid. Everything
 * expensive about retrieval happens HERE, once per (skill, level) pair, off the
 * request path, and is then read by every user forever for the price of a
 * primary-key lookup.
 *
 * ```
 *   STANDARD RAG                    RLE
 *   ─────────────────────────       ─────────────────────────────────────────
 *   per request: embed, search,     per request: SELECT … FROM skill_bundles
 *   rerank, stuff passages, gen     this script: search, rank, diversify, freeze
 * ```
 *
 * Run it after `pnpm seed:catalog`, and again whenever the catalog changes.
 * NEVER on a user request — that is invariant I1, and breaking it converts a
 * fixed nightly cost into a per-run one.
 *
 * ── What this implementation does and does not do ───────────────────────────
 * rag-strategy.md §5–§7 specifies hybrid search (dense + sparse, fused with
 * RRF) over a chunk corpus, then a cross-encoder rerank, then MMR. This repo has
 * no chunk corpus and no embeddings — the material is a curated catalog of whole
 * resources, not indexed transcripts (planning.md Phase 3 is the phase that
 * builds those, and it needs ingest infrastructure this repo does not yet have).
 *
 * So candidate generation here is the taxonomy join rather than a vector search,
 * and ranking is the §7 formula over the metadata we do hold. Steps 3, 4 and 5 —
 * the roll-up, the diversity rule, and the freeze — are implemented as
 * specified, because those are the steps that decide what a user sees, and they
 * do not depend on how candidates were generated. When the corpus exists, only
 * `candidatesFor()` changes.
 */
import "./env";
import { db } from "../lib/db";
import { NODES } from "../lib/catalog/taxonomy";

type Level = "intro" | "working" | "deep";

const LEVELS: Level[] = ["intro", "working", "deep"];

/** Spec §7: freeze the top five. The selector picks ≤3 of them per user. */
const BUNDLE_SIZE = 5;

/** Corpus guardrail: max two resources from one author or channel per bundle. */
const MAX_PER_AUTHOR = 2;

/** Resources below this never enter a bundle (guardrails.md, Corpus). */
const QUALITY_FLOOR = 0.35;

interface Candidate {
  courseId: string;
  author: string;
  type: string;
  quality: number;
  confidence: number;
  isPrimary: boolean;
  /** 0 when tagged at exactly the requested level; 1 for an adjacent one. */
  levelDistance: number;
  /** 0 when tagged for this skill; 1 for a child of it. */
  hopDistance: number;
  entryLabel: string | null;
  entryUrl: string | null;
  summary: string | null;
}

async function main() {
  const skills = await db.skill.findMany({ select: { id: true, name: true } });
  const skillIdByName = new Map(skills.map((s) => [s.name, s.id]));

  // Children of each node. A resource that teaches "Next.js" is legitimate
  // material for a "React" bundle at `deep` — it is not the reverse, because a
  // React tutorial does not teach Next.js.
  const childIds = new Map<string, string[]>();
  for (const node of NODES.values()) {
    if (!node.parent) continue;
    const parentId = skillIdByName.get(node.parent);
    const childId = skillIdByName.get(node.name);
    if (!parentId || !childId) continue;
    childIds.set(parentId, [...(childIds.get(parentId) ?? []), childId]);
  }

  const links = await db.courseSkill.findMany({
    include: {
      course: {
        select: {
          id: true,
          author: true,
          provider: true,
          type: true,
          qualityScore: true,
          status: true,
        },
      },
    },
  });

  // skillId → its CourseSkill rows, so the loop below is in-memory rather than
  // a query per (skill, level) pair.
  const bySkill = new Map<string, typeof links>();
  for (const link of links) {
    if (link.course.status !== "active") continue;
    bySkill.set(link.skillId, [...(bySkill.get(link.skillId) ?? []), link]);
  }

  let written = 0;
  let empty = 0;

  for (const skill of skills) {
    for (const level of LEVELS) {
      const candidates = candidatesFor(skill.id, level, bySkill, childIds.get(skill.id) ?? []);
      const ranked = rankAndDiversify(candidates);

      if (ranked.length === 0) {
        // An empty bundle is a real state, and the §9 fallback handles it. We
        // delete rather than write an empty row so a bundle that USED to have
        // material and now has none reads as absent, not as stale.
        await db.skillBundle.deleteMany({ where: { skillId: skill.id, level } });
        empty++;
        continue;
      }

      const entryPoints: Record<string, unknown> = {};
      for (const candidate of ranked) {
        entryPoints[candidate.courseId] = {
          entryLabel: candidate.entryLabel,
          entryUrl: candidate.entryUrl,
          summary: candidate.summary,
        };
      }

      const payload = {
        rankedCourseIds: ranked.map((c) => c.courseId),
        entryPoints: entryPoints as object,
        refreshedAt: new Date(),
      };

      await db.skillBundle.upsert({
        where: { skillId_level: { skillId: skill.id, level } },
        create: { skillId: skill.id, level, ...payload },
        update: payload,
      });
      written++;
    }
  }

  const coverage = written / (skills.length * LEVELS.length);
  console.log(`bundles written: ${written}`);
  console.log(`empty (skill, level) pairs: ${empty}`);
  console.log(`bundle coverage: ${Math.round(coverage * 100)}%`);
  if (coverage < 0.8) {
    // rag-strategy.md §11's leading indicator. Below 80% users start hitting
    // roadmap fallbacks, which is the corpus telling you what to index next.
    console.log(
      `\ncoverage is under the 80% target — read corpus_gaps ranked by demand;\n` +
        `that table IS the ingestion backlog.`,
    );
  }

  await db.$disconnect();
}

/**
 * Step 1 — candidate generation.
 *
 * The taxonomy join stands in for the hybrid search of rag-strategy.md §5. Two
 * widenings, both one hop and both penalised so they can never outrank an exact
 * match: an adjacent level, and a child skill.
 */
function candidatesFor(
  skillId: string,
  level: Level,
  bySkill: Map<string, Array<{ skillId: string; level: string; confidence: unknown; isPrimary: boolean; entryLabel: string | null; entryUrl: string | null; summary: string | null; course: { id: string; author: string | null; provider: string; type: string; qualityScore: unknown } }>>,
  children: string[],
): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();

  const consider = (
    rows: ReturnType<typeof bySkill.get>,
    hopDistance: number,
  ) => {
    for (const row of rows ?? []) {
      const distance = Math.abs(LEVELS.indexOf(level) - LEVELS.indexOf(row.level as Level));
      if (distance > 1) continue;

      const quality = Number(row.course.qualityScore);
      if (quality < QUALITY_FLOOR) continue;

      // Keep the closest tagging of a resource, never two rows for one course.
      if (seen.has(row.course.id)) continue;
      seen.add(row.course.id);

      out.push({
        courseId: row.course.id,
        author: row.course.author ?? row.course.provider,
        type: row.course.type,
        quality,
        confidence: Number(row.confidence),
        isPrimary: row.isPrimary,
        levelDistance: distance,
        hopDistance,
        entryLabel: row.entryLabel,
        entryUrl: row.entryUrl,
        summary: row.summary,
      });
    }
  };

  consider(bySkill.get(skillId), 0);
  for (const childId of children) consider(bySkill.get(childId), 1);

  return out;
}

/**
 * Steps 3–5 — roll-up, diversity, freeze.
 *
 * `resource_score = 0.6 × match + 0.25 × quality + 0.15 × coverage`, which is
 * rag-strategy.md §7 step 3 with `match` standing in for the reranked best-chunk
 * score and `coverage` read off `is_primary` (a resource tagged as primary for
 * this skill covers more of it than one that mentions it among six others).
 *
 * The diversity pass is MMR's purpose without its machinery: cap any one author
 * at two, then prefer a format we have not used yet, so a bundle serves
 * different learning preferences without personalising.
 */
function rankAndDiversify(candidates: Candidate[]): Candidate[] {
  const scored = candidates
    .map((candidate) => {
      const match =
        candidate.confidence * (1 - 0.3 * candidate.levelDistance) * (1 - 0.25 * candidate.hopDistance);
      const coverage = candidate.isPrimary ? 1 : 0.5;
      return { candidate, score: 0.6 * match + 0.25 * candidate.quality + 0.15 * coverage };
    })
    .sort((a, b) => b.score - a.score || a.candidate.courseId.localeCompare(b.candidate.courseId));

  const chosen: Candidate[] = [];
  const perAuthor = new Map<string, number>();
  const usedTypes = new Set<string>();

  // Two passes: the first takes only formats we have not used, so a bundle of
  // five is never five videos when a doc and a repo were available.
  //
  // The variety pass is CAPPED, and the cap is the point. There are five
  // resource types and five slots, so an uncapped pass would fill the whole
  // bundle with one-of-each and let a mediocre repo displace the second-best
  // course. Variety is worth something; it is not worth more than the top of
  // the ranking. Two slots are held back for score alone.
  const varietyCap = Math.max(1, BUNDLE_SIZE - 2);

  for (const pass of [0, 1]) {
    for (const { candidate } of scored) {
      if (chosen.length >= BUNDLE_SIZE) break;
      if (pass === 0 && chosen.length >= varietyCap) break;
      if (chosen.includes(candidate)) continue;
      if ((perAuthor.get(candidate.author) ?? 0) >= MAX_PER_AUTHOR) continue;
      if (pass === 0 && usedTypes.has(candidate.type)) continue;

      chosen.push(candidate);
      usedTypes.add(candidate.type);
      perAuthor.set(candidate.author, (perAuthor.get(candidate.author) ?? 0) + 1);
    }
  }

  return chosen;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

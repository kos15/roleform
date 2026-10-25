/**
 * Course discovery for the curated catalog — candidates for a person to curate.
 *
 * `corpus_gaps` records every (skill, level) a learning plan asked for and the
 * catalog couldn't serve (rag-strategy.md §11; `pnpm check:corpus` counts
 * them). The remedy is always the same: a person adds a `CourseDef`. This
 * script does the looking-up half of that job, most-demanded gaps first.
 *
 *   1. DeepSeek Search per gap: the skill's canonical name and a level word.
 *      Nothing from any member is in the query (N7) — `corpus_gaps` holds a
 *      skill id, a level and a count, no user.
 *   2. Results are kept only when DeepSeek itself rates them high-quality
 *      (rerank ≥ 1.5) or authoritative (authority ≥ 3), and are not already
 *      in `COURSES`.
 *   3. Each kept URL gets the same liveness check `pnpm seed:catalog` runs.
 *
 * Nothing is written — not to `courses`, not to `lib/catalog/courses.ts`. A
 * course URL reaches a member only after a person writes the entry and the
 * seed re-checks it (N8). This runs at curation time, so the Learning tab and
 * the roadmap keep making exactly the calls they make today (N12/N13).
 *
 *   pnpm catalog:discover                 top 10 gaps from the database
 *   pnpm catalog:discover --limit 25
 *   pnpm catalog:discover --skill "Kubernetes" --level working     no database
 *
 * Cost: one search per gap ($0.75 per 1,000).
 */
import "./env";
import { webSearch, describeFailure, deepseekConfigured } from "../lib/search/deepseek";
import { checkLiveness } from "../lib/catalog/liveness";
import { COURSES } from "../lib/catalog/courses";

type Level = "intro" | "working" | "deep";
const LEVEL_WORDS: Record<Level, string> = {
  intro: "beginner tutorial",
  working: "course hands-on",
  deep: "advanced guide",
};
const PER_GAP = 5;
const MIN_RERANK = 1.5;
const MIN_AUTHORITY = 3;

interface Gap {
  skill: string;
  level: Level;
  demand: number | null;
}

function parseArgs(argv: string[]): { limit: number; skill: string | null; level: Level } {
  let limit = 10;
  let skill: string | null = null;
  let level: Level = "working";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") limit = Math.max(1, Number(argv[++i]) || limit);
    else if (argv[i] === "--skill") skill = argv[++i] ?? null;
    else if (argv[i] === "--level") {
      const l = argv[++i];
      if (l === "intro" || l === "working" || l === "deep") level = l;
    }
  }
  return { limit, skill, level };
}

async function gapsFromDb(limit: number): Promise<Gap[]> {
  const { db } = await import("../lib/db");
  const rows = await db.corpusGap.findMany({
    orderBy: { count: "desc" },
    take: limit,
    select: { level: true, count: true, skill: { select: { name: true } } },
  });
  return rows.map((r) => ({ skill: r.skill.name, level: r.level as Level, demand: r.count }));
}

function normalisedUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

async function main() {
  if (!deepseekConfigured()) {
    console.error("DEEPSEEK_API_KEY is not set (.env.local). Nothing to do.");
    process.exit(1);
  }
  const args = parseArgs(process.argv.slice(2));
  const gaps: Gap[] = args.skill ? [{ skill: args.skill, level: args.level, demand: null }] : await gapsFromDb(args.limit);
  if (gaps.length === 0) {
    console.log("No corpus gaps recorded. Nothing to look for.");
    return;
  }

  const inCatalog = new Set(COURSES.map((c) => normalisedUrl(c.url)));
  const knownHosts = new Set(COURSES.map((c) => new URL(c.url).hostname.replace(/^www\./, "")));

  for (const gap of gaps) {
    const demand = gap.demand === null ? "" : ` · asked for ${gap.demand}×`;
    console.log(`\n■ ${gap.skill} (${gap.level})${demand}`);

    const out = await webSearch(`${gap.skill} ${LEVEL_WORDS[gap.level]}`, 20);
    if (!out.ok) {
      console.log(`  search failed — ${describeFailure(out.error)}`);
      if (out.error.kind === "http" && (out.error.status === 401 || out.error.status === 402)) process.exit(1);
      continue;
    }

    const kept = out.hits
      .filter((h) => h.rerank_score >= MIN_RERANK || h.authority >= MIN_AUTHORITY)
      .filter((h) => !inCatalog.has(normalisedUrl(h.url)))
      .slice(0, PER_GAP);
    if (kept.length === 0) {
      console.log("  no high-quality candidates — try --skill with a different name");
      continue;
    }

    for (const hit of kept) {
      const host = new URL(hit.url).hostname.replace(/^www\./, "");
      const liveness = await checkLiveness(hit.url);
      const tags = [
        `rerank ${hit.rerank_score.toFixed(1)}`,
        `authority ${hit.authority}`,
        liveness,
        knownHosts.has(host) ? "provider already in catalog" : null,
      ].filter(Boolean);
      console.log(`  - ${hit.title}\n    ${hit.url}\n    ${tags.join(" · ")}`);
    }
  }

  console.log(
    "\nCandidates only. Read each one, write a CourseDef (taught skill first) in lib/catalog/courses.ts,\n" +
      "then `pnpm seed:catalog` re-checks the link and `pnpm bundles:rebuild` puts it in front of members.",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : "failed");
  process.exit(1);
});

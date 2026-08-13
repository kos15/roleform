/**
 * Corpus health — rag-strategy.md §11, planning.md Phase 6's dashboard as a CLI.
 *
 * These are the LEADING indicators of the learning engine quietly degrading.
 * Each one fails silently in production: a user who hits a roadmap fallback sees
 * a working page, a user whose skill term never resolved sees a gap that simply
 * isn't mentioned, and neither generates an error anybody reads.
 *
 * Run it after any ingest, any catalog change, and at every phase gate.
 *
 *   pnpm check:corpus
 */
import "./env";
import { db } from "../lib/db";
import { NODES } from "../lib/catalog/taxonomy";

/** Targets from rag-strategy.md §11. Not aspirations — thresholds. */
const TARGET = {
  bundleCoverage: 0.8,
  fallbackRate: 0.1,
  resolutionRate: 0.9,
  deadLinkRate: 0.02,
};

interface Metric {
  name: string;
  value: string;
  ok: boolean | null;
  meaning: string;
}

async function main() {
  const metrics: Metric[] = [];

  /* ------------------------------------------------ 1. bundle coverage */
  //
  // Measured against nodes REAL POSTINGS asked for, not against the whole
  // taxonomy. Coverage of skills nobody is hiring for is not coverage.
  const observed = await db.jdRequirement.findMany({
    where: { skillId: { not: null } },
    select: { skillId: true },
    distinct: ["skillId"],
  });
  const observedIds = observed.map((r) => r.skillId!).filter(Boolean);

  if (observedIds.length === 0) {
    metrics.push({
      name: "Bundle coverage (JD-observed nodes)",
      value: "no analyses yet",
      ok: null,
      meaning: "Falls back to whole-taxonomy coverage below until postings exist.",
    });
  } else {
    const withBundle = await db.skillBundle.findMany({
      where: { skillId: { in: observedIds } },
      select: { skillId: true },
      distinct: ["skillId"],
    });
    const rate = withBundle.length / observedIds.length;
    metrics.push({
      name: "Bundle coverage (JD-observed nodes)",
      value: `${pct(rate)} (${withBundle.length}/${observedIds.length})`,
      ok: rate >= TARGET.bundleCoverage,
      meaning: "Below 80% and users start hitting roadmap fallbacks.",
    });
  }

  const [skillCount, bundleCount] = await Promise.all([db.skill.count(), db.skillBundle.count()]);
  const wholeRate = bundleCount / (skillCount * 3);
  metrics.push({
    name: "Bundle coverage (whole taxonomy)",
    value: `${pct(wholeRate)} (${bundleCount}/${skillCount * 3} skill×level pairs)`,
    ok: wholeRate >= TARGET.bundleCoverage,
    meaning: "Every (skill, level) the engine can be asked for.",
  });

  /* ---------------------------------------------------- 2. fallback rate */
  //
  // Split by CAUSE, because the two causes have opposite remedies and a single
  // number hides which one you have.
  //
  //   corpus     the bundle was empty. Fix: index more material.
  //   precision  the bundle had material, but the gap could not be bound to a
  //              résumé bullet and an interview question, so spec §1's rule
  //              ("a resource that cannot be bound to all three is not shown")
  //              withheld it. Fix: nothing in the corpus. This is the product
  //              working as specified, and it needs to be visible as such.
  //
  // The two are distinguishable exactly, because an unbound gap is precisely
  // one missing `unlocks_bullet_id` or `answers_question_id`.
  const [gapTotal, gapFallback, unbound] = await Promise.all([
    db.skillGap.count(),
    db.skillGap.count({ where: { fallbackUrl: { not: null } } }),
    db.skillGap.count({
      where: {
        fallbackUrl: { not: null },
        OR: [{ unlocksBulletId: null }, { answersQuestionId: null }],
      },
    }),
  ]);
  const corpusFallback = gapFallback - unbound;

  metrics.push({
    name: "Fallback rate — corpus had nothing",
    value: gapTotal === 0 ? "no gaps yet" : `${pct(corpusFallback / gapTotal)} (${corpusFallback}/${gapTotal})`,
    ok: gapTotal === 0 ? null : corpusFallback / gapTotal <= TARGET.fallbackRate,
    meaning: "The measure rag-strategy §11 targets at <10%. Remedy: index what corpus_gaps ranks highest.",
  });

  metrics.push({
    name: "Fallback rate — gap could not be bound",
    value: gapTotal === 0 ? "no gaps yet" : `${pct(unbound / gapTotal)} (${unbound}/${gapTotal})`,
    // Deliberately not scored against a target. This is spec §1's precision bar
    // doing its job, not a defect — but if it runs high the bar is costing more
    // material than it is buying trust, and that is a product call to make with
    // the number in hand rather than a threshold to fail silently against.
    ok: null,
    meaning: "No résumé bullet or interview question to bind to, so material was withheld by design.",
  });

  /* -------------------------------------------------- 3. resolution rate */
  const plans = await db.learningPlan.aggregate({ _avg: { resolutionRate: true }, _count: true });
  metrics.push({
    name: "Resolution rate",
    value:
      plans._count === 0
        ? "no plans yet"
        : `${pct(Number(plans._avg.resolutionRate ?? 1))} over ${plans._count} run(s)`,
    ok: plans._count === 0 ? null : Number(plans._avg.resolutionRate ?? 1) >= TARGET.resolutionRate,
    meaning: "Below 0.90 the taxonomy is drifting behind the market. Fix aliases, not the model.",
  });

  /* --------------------------------------------------- 4. dead link rate */
  const [courseTotal, courseDead, courseBlocked] = await Promise.all([
    db.course.count(),
    db.course.count({ where: { status: "dead" } }),
    db.course.count({ where: { status: "quarantined" } }),
  ]);
  metrics.push({
    name: "Dead link rate",
    value: `${pct(courseDead / Math.max(1, courseTotal))} (${courseDead} dead, ${courseBlocked} quarantined, ${courseTotal} total)`,
    ok: courseDead / Math.max(1, courseTotal) <= TARGET.deadLinkRate,
    meaning: "A recommendation that 404s destroys more trust than a missing one. Run pnpm check:links.",
  });

  /* ------------------------------------------- 5. freshness, high-volatility */
  //
  // Reported as unknown rather than as a passing number. The curated catalog
  // carries no published_at for most entries, and printing "0 months" from
  // absent data would be a metric that lies in the reassuring direction.
  const volatileNames = [...NODES.values()].filter((n) => n.volatility === "high").map((n) => n.name);
  const volatileSkills = await db.skill.findMany({
    where: { name: { in: volatileNames } },
    select: { id: true },
  });
  const links = await db.courseSkill.findMany({
    where: { skillId: { in: volatileSkills.map((s) => s.id) } },
    select: { course: { select: { publishedAt: true } } },
  });
  const dated = links.map((l) => l.course.publishedAt).filter((d): d is Date => d !== null);
  metrics.push({
    name: "Median age, high-volatility skills",
    value:
      dated.length === 0
        ? `unknown — 0 of ${links.length} resources carry a published date`
        : `${medianMonths(dated)} months (${dated.length}/${links.length} dated)`,
    ok: null,
    meaning: "Target <12 months. Needs published_at, which the ingest pipeline supplies.",
  });

  /* ------------------------------------------------------ 6. JD cache hits */
  const [analyses, distinctHashes] = await Promise.all([
    db.analysis.count(),
    db.analysis.findMany({ select: { contentHash: true }, distinct: ["contentHash"] }),
  ]);
  metrics.push({
    name: "JD cache hit rate",
    value: analyses === 0 ? "no analyses yet" : `${pct(1 - distinctHashes.length / analyses)} over ${analyses} analyses`,
    ok: null,
    meaning: "Target >40% after 1k runs. Below that with volume means hashing or dedupe is broken.",
  });

  /* --------------------------------------------------------------- report */
  console.log("\nCorpus health — rag-strategy.md §11\n");
  for (const m of metrics) {
    const mark = m.ok === null ? "  ·  " : m.ok ? " PASS" : " FAIL";
    console.log(`${mark}  ${m.name}\n        ${m.value}\n        ${m.meaning}\n`);
  }

  /* ------------------------------------------ the two backlogs, ranked */
  const gaps = await db.corpusGap.findMany({
    orderBy: { count: "desc" },
    take: 15,
    include: { skill: { select: { name: true } } },
  });
  console.log("Ingestion backlog — corpus_gaps by observed demand:");
  console.log(
    gaps.length === 0
      ? "  (empty — no run has hit a fallback yet)"
      : gaps.map((g) => `  ${String(g.count).padStart(4)}×  ${g.skill.name} / ${g.level}`).join("\n"),
  );

  const terms = await db.unresolvedTerm.findMany({ orderBy: { seenCount: "desc" }, take: 15 });
  console.log("\nTaxonomy backlog — unresolved_terms by frequency:");
  console.log(
    terms.length === 0
      ? "  (empty — every extracted term resolved)"
      : terms.map((t) => `  ${String(t.seenCount).padStart(4)}×  ${t.term}`).join("\n"),
  );

  const failed = metrics.filter((m) => m.ok === false);
  console.log(`\n${metrics.filter((m) => m.ok === true).length} passing, ${failed.length} failing, ${metrics.filter((m) => m.ok === null).length} not yet measurable.`);
  await db.$disconnect();
  process.exit(failed.length === 0 ? 0 : 1);
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

function medianMonths(dates: Date[]): number {
  const months = dates
    .map((d) => (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44))
    .sort((a, b) => a - b);
  const mid = Math.floor(months.length / 2);
  return Math.round(months.length % 2 ? months[mid] : (months[mid - 1] + months[mid]) / 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

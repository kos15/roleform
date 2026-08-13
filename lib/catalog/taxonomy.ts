/**
 * The taxonomy spine (RLE spec §0, §4). PURE data — no I/O, no network.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * The Learning Engine's entire cost model rests on one claim: the query space
 * is CLOSED. Every question the retrieval layer can be asked is a
 * `(skill_id, level)` pair drawn from a finite, curated vocabulary. That is what
 * lets the expensive half of retrieval run once, at ingest, and be read by every
 * user forever for zero tokens.
 *
 * `lib/catalog/skills.ts` already gives us the closed vocabulary and the alias
 * table. What it does not give us is *structure*: which node is a parent of
 * which, how deep a node sits, and where roadmap.sh documents it. This file adds
 * exactly that, and nothing else.
 *
 * ── Why the tree is built from names already in SKILLS ──────────────────────
 * A taxonomy node that is not in `SKILLS` would not be resolvable, would not be
 * matchable against a course, and would exist only to be a parent. Every parent
 * here is therefore a real canonical skill someone can actually be asked for.
 * The cost is a slightly flatter tree than roadmap.sh's own; the benefit is that
 * `canonicalSkill()`, the resolver, the course matcher and the taxonomy all read
 * from one list and cannot drift apart.
 *
 * ── roadmapSlug is ingested, never fetched ──────────────────────────────────
 * RLE spec §4: never depend on roadmap.sh at request time. A third-party call in
 * the request path adds latency, a failure mode and a rate limit to every run,
 * for data that changes monthly at most. These slugs are checked by
 * `pnpm check:links` alongside the course catalog, so a roadmap that moves is
 * caught by the same sweep that catches a dead course.
 *
 * ── volatility drives the recency floor (spec §7) ───────────────────────────
 * For a `high` node we drop material older than 18 months regardless of how good
 * it is, because a 2019 React tutorial teaches a React that no longer exists.
 * For `low` nodes age is close to irrelevant and dropping on it would throw away
 * the best material we have.
 */

import { SKILLS } from "./skills";

export type Volatility = "low" | "medium" | "high";

export interface TaxonomyDef {
  /**
   * The canonical name of this node's parent, or null for a root.
   * MUST be a name present in SKILLS — enforced by `assertTaxonomy()`.
   */
  parent: string | null;
  /**
   * roadmap.sh path this node is documented at, relative to the site root.
   * Used for the §9 fallback when the corpus has nothing, and for nothing else.
   * Null where roadmap.sh has no honest home for the topic — we would rather
   * show no fallback than a link that lands on something unrelated.
   */
  roadmap: string | null;
  volatility: Volatility;
}

/**
 * name → structure. Every key is a canonical name from SKILLS.
 *
 * Parenting rule: a parent is a node you would genuinely learn FIRST, not a
 * category label. "Next.js → React" is a real prerequisite; "React → Frontend"
 * would be a filing decision, and filing decisions make bad prerequisites.
 * Where no real prerequisite exists inside the canon, the node is a root.
 */
export const TAXONOMY: Record<string, TaxonomyDef> = {
  /* --------------------------------------------------------------- languages */
  JavaScript: { parent: null, roadmap: "javascript", volatility: "low" },
  TypeScript: { parent: "JavaScript", roadmap: "typescript", volatility: "medium" },
  Python: { parent: null, roadmap: "python", volatility: "low" },
  Java: { parent: null, roadmap: "java", volatility: "low" },
  "C#": { parent: null, roadmap: "aspnet-core", volatility: "low" },
  Go: { parent: null, roadmap: "golang", volatility: "low" },
  Rust: { parent: null, roadmap: "rust", volatility: "medium" },
  Ruby: { parent: null, roadmap: null, volatility: "low" },
  PHP: { parent: null, roadmap: "php", volatility: "low" },
  Kotlin: { parent: null, roadmap: "android", volatility: "medium" },
  Swift: { parent: null, roadmap: "ios", volatility: "medium" },
  Scala: { parent: null, roadmap: null, volatility: "low" },
  "C++": { parent: null, roadmap: "cpp", volatility: "low" },
  SQL: { parent: null, roadmap: "sql", volatility: "low" },
  Bash: { parent: "Linux", roadmap: "linux", volatility: "low" },

  /* ---------------------------------------------------------------- frontend */
  HTML: { parent: null, roadmap: "frontend", volatility: "low" },
  CSS: { parent: "HTML", roadmap: "frontend", volatility: "low" },
  "Tailwind CSS": { parent: "CSS", roadmap: "frontend", volatility: "medium" },
  React: { parent: "JavaScript", roadmap: "react", volatility: "high" },
  "Next.js": { parent: "React", roadmap: "react", volatility: "high" },
  Redux: { parent: "React", roadmap: "react", volatility: "medium" },
  "React Native": { parent: "React", roadmap: "react-native", volatility: "high" },
  Angular: { parent: "TypeScript", roadmap: "angular", volatility: "medium" },
  RxJS: { parent: "Angular", roadmap: "angular", volatility: "medium" },
  "Vue.js": { parent: "JavaScript", roadmap: "vue", volatility: "medium" },
  Svelte: { parent: "JavaScript", roadmap: "frontend", volatility: "high" },
  "Web Accessibility": { parent: "HTML", roadmap: "frontend", volatility: "low" },
  "Web Performance": { parent: "JavaScript", roadmap: "frontend", volatility: "medium" },

  /* ----------------------------------------------------------------- backend */
  "Node.js": { parent: "JavaScript", roadmap: "nodejs", volatility: "medium" },
  Express: { parent: "Node.js", roadmap: "nodejs", volatility: "low" },
  NestJS: { parent: "Node.js", roadmap: "nodejs", volatility: "medium" },
  Django: { parent: "Python", roadmap: "backend", volatility: "low" },
  Flask: { parent: "Python", roadmap: "backend", volatility: "low" },
  FastAPI: { parent: "Python", roadmap: "backend", volatility: "medium" },
  "Spring Boot": { parent: "Java", roadmap: "spring-boot", volatility: "low" },
  "Ruby on Rails": { parent: "Ruby", roadmap: "backend", volatility: "low" },
  "ASP.NET": { parent: "C#", roadmap: "aspnet-core", volatility: "low" },
  "REST APIs": { parent: null, roadmap: "api-design", volatility: "low" },
  GraphQL: { parent: "REST APIs", roadmap: "graphql", volatility: "medium" },
  gRPC: { parent: "REST APIs", roadmap: "api-design", volatility: "low" },
  WebSockets: { parent: "REST APIs", roadmap: "api-design", volatility: "low" },
  Microservices: { parent: "System Design", roadmap: "software-architect", volatility: "low" },
  "Message Queues": { parent: "System Design", roadmap: "software-architect", volatility: "low" },
  "Apache Kafka": { parent: "Message Queues", roadmap: "software-architect", volatility: "medium" },

  /* -------------------------------------------------------------------- data */
  PostgreSQL: { parent: "SQL", roadmap: "postgresql-dba", volatility: "low" },
  MySQL: { parent: "SQL", roadmap: "backend", volatility: "low" },
  MongoDB: { parent: null, roadmap: "mongodb", volatility: "low" },
  Redis: { parent: null, roadmap: "backend", volatility: "low" },
  Elasticsearch: { parent: null, roadmap: "backend", volatility: "medium" },
  "Data Modeling": { parent: "SQL", roadmap: "data-analyst", volatility: "low" },
  ETL: { parent: "SQL", roadmap: "data-analyst", volatility: "low" },
  "Apache Spark": { parent: "ETL", roadmap: "data-analyst", volatility: "medium" },
  dbt: { parent: "ETL", roadmap: "data-analyst", volatility: "high" },
  Airflow: { parent: "ETL", roadmap: "data-analyst", volatility: "medium" },
  Snowflake: { parent: "SQL", roadmap: "data-analyst", volatility: "medium" },
  BigQuery: { parent: "SQL", roadmap: "data-analyst", volatility: "medium" },
  Pandas: { parent: "Python", roadmap: "data-analyst", volatility: "low" },
  "Data Visualization": { parent: null, roadmap: "data-analyst", volatility: "low" },

  /* ------------------------------------------------------------------- cloud */
  AWS: { parent: null, roadmap: "aws", volatility: "medium" },
  "Google Cloud": { parent: null, roadmap: "devops", volatility: "medium" },
  Azure: { parent: null, roadmap: "devops", volatility: "medium" },
  Serverless: { parent: "AWS", roadmap: "devops", volatility: "high" },

  /* ------------------------------------------------------------------ devops */
  Linux: { parent: null, roadmap: "linux", volatility: "low" },
  Docker: { parent: "Linux", roadmap: "docker", volatility: "low" },
  Kubernetes: { parent: "Docker", roadmap: "kubernetes", volatility: "high" },
  Terraform: { parent: null, roadmap: "terraform", volatility: "high" },
  "CI/CD": { parent: "Git", roadmap: "devops", volatility: "medium" },
  Observability: { parent: null, roadmap: "devops", volatility: "medium" },
  Nginx: { parent: "Linux", roadmap: "devops", volatility: "low" },

  /* ------------------------------------------------------------------ mobile */
  Flutter: { parent: null, roadmap: "flutter", volatility: "high" },
  "iOS Development": { parent: "Swift", roadmap: "ios", volatility: "medium" },
  "Android Development": { parent: "Kotlin", roadmap: "android", volatility: "medium" },

  /* ----------------------------------------------------------------- testing */
  "Unit Testing": { parent: null, roadmap: "qa", volatility: "low" },
  "React Testing Library": { parent: "Unit Testing", roadmap: "react", volatility: "medium" },
  "End-to-End Testing": { parent: "Unit Testing", roadmap: "qa", volatility: "medium" },
  "Test-Driven Development": { parent: "Unit Testing", roadmap: "qa", volatility: "low" },

  /* ---------------------------------------------------------------- security */
  Authentication: { parent: null, roadmap: "cyber-security", volatility: "medium" },
  "Application Security": { parent: null, roadmap: "cyber-security", volatility: "medium" },
  Encryption: { parent: "Application Security", roadmap: "cyber-security", volatility: "low" },

  /* ---------------------------------------------------------------------- ai */
  "Machine Learning": { parent: "Python", roadmap: "ai-data-scientist", volatility: "medium" },
  "Deep Learning": { parent: "Machine Learning", roadmap: "ai-data-scientist", volatility: "high" },
  NLP: { parent: "Machine Learning", roadmap: "ai-data-scientist", volatility: "high" },
  "LLM Applications": { parent: null, roadmap: "ai-engineer", volatility: "high" },
  "Vector Databases": { parent: "LLM Applications", roadmap: "ai-engineer", volatility: "high" },

  /* ------------------------------------------------------------------ design */
  Figma: { parent: null, roadmap: "ux-design", volatility: "medium" },
  "Design Systems": { parent: "Figma", roadmap: "ux-design", volatility: "low" },
  "UX Research": { parent: null, roadmap: "ux-design", volatility: "low" },

  /* ---------------------------------------------------------------- practice */
  Git: { parent: null, roadmap: "git-github", volatility: "low" },
  "Code Review": { parent: "Git", roadmap: "code-review", volatility: "low" },
  Agile: { parent: null, roadmap: null, volatility: "low" },
  "System Design": { parent: null, roadmap: "system-design", volatility: "low" },
  "Technical Leadership": { parent: null, roadmap: "engineering-manager", volatility: "low" },
  "Stakeholder Management": { parent: null, roadmap: "engineering-manager", volatility: "low" },
  "Product Thinking": { parent: null, roadmap: "product-manager", volatility: "low" },
  "Technical Writing": { parent: null, roadmap: "technical-writer", volatility: "low" },
  "Incident Response": { parent: "Observability", roadmap: "devops", volatility: "low" },
};

/* -------------------------------------------------------------- derived form */

export interface TaxonomyNode extends TaxonomyDef {
  name: string;
  /** URL-safe identifier. Stable — it is what `skills.slug` stores. */
  slug: string;
  /** 0 for a root. Feeds `w_depth` in the importance formula (spec §5). */
  depth: number;
  /** Root → … → self, inclusive. Used for the ≤2-hop evidence walk (spec §6). */
  path: string[];
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\+/g, "p") // C++ → cpp, not c--
    .replace(/#/g, "sharp") // C# → csharp
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Every canonical skill as a taxonomy node.
 *
 * A skill absent from TAXONOMY is not an error — it is a root with no roadmap
 * and medium volatility. Failing the whole build because someone added a skill
 * and forgot the tree entry would be the wrong trade: the resolver and the
 * course matcher would stop working for every other skill too.
 */
export const NODES: Map<string, TaxonomyNode> = (() => {
  const defs = new Map<string, TaxonomyDef>(
    SKILLS.map((s) => [s.name, TAXONOMY[s.name] ?? { parent: null, roadmap: null, volatility: "medium" }]),
  );

  const nodes = new Map<string, TaxonomyNode>();

  const resolvePath = (name: string, seen: Set<string>): string[] => {
    if (seen.has(name)) return [name]; // cycle guard — see assertTaxonomy
    seen.add(name);
    const def = defs.get(name);
    if (!def || !def.parent || !defs.has(def.parent)) return [name];
    return [...resolvePath(def.parent, seen), name];
  };

  for (const [name, def] of defs) {
    const path = resolvePath(name, new Set());
    nodes.set(name, {
      ...def,
      name,
      slug: slugify(name),
      depth: path.length - 1,
      path,
    });
  }

  return nodes;
})();

export function nodeFor(name: string): TaxonomyNode | null {
  return NODES.get(name) ?? null;
}

/**
 * Taxonomy distance between two nodes, or null when they are unrelated.
 *
 * Spec §6 grades evidence by how far the claimed skill sits from the required
 * one: a parent claim ("React" against a "React hooks" requirement) is worth
 * something, a claim two hops away is worth less, and beyond that it is worth
 * nothing and pretending otherwise is how a tool starts flattering people.
 *
 * Distance is measured through the lowest common ancestor, so a sibling
 * ("Flask" against "Django", both children of Python) is 2 hops.
 */
export function hops(a: string, b: string): number | null {
  const from = NODES.get(a);
  const to = NODES.get(b);
  if (!from || !to) return null;
  if (a === b) return 0;

  const index = new Map(from.path.map((n, i) => [n, i]));
  for (let i = to.path.length - 1; i >= 0; i--) {
    const shared = index.get(to.path[i]);
    if (shared !== undefined) {
      return from.path.length - 1 - shared + (to.path.length - 1 - i);
    }
  }
  return null;
}

/** The roadmap.sh URL for the §9 fallback, or null when we have no honest one. */
export function roadmapUrl(name: string): string | null {
  const node = NODES.get(name);
  return node?.roadmap ? `https://roadmap.sh/${node.roadmap}` : null;
}

/**
 * Structural checks the seed script runs before writing anything.
 *
 * With no test suite (CLAUDE.md §11) the seed script is where a broken tree has
 * to be caught — after it reaches the database, `depth` and `parent_id` are
 * silently wrong and every severity score computed from them is silently wrong
 * with them.
 */
export function assertTaxonomy(): string[] {
  const problems: string[] = [];
  const known = new Set(SKILLS.map((s) => s.name));

  for (const [name, def] of Object.entries(TAXONOMY)) {
    if (!known.has(name)) problems.push(`TAXONOMY has "${name}", which is not a canonical skill.`);
    if (def.parent && !known.has(def.parent)) {
      problems.push(`"${name}" names parent "${def.parent}", which is not a canonical skill.`);
    }
    if (def.parent === name) problems.push(`"${name}" is its own parent.`);
  }

  // Cycles: walk each chain and stop if we revisit a name.
  for (const name of Object.keys(TAXONOMY)) {
    const seen = new Set<string>();
    let cursor: string | null = name;
    while (cursor) {
      if (seen.has(cursor)) {
        problems.push(`Cycle in the taxonomy through "${name}".`);
        break;
      }
      seen.add(cursor);
      cursor = TAXONOMY[cursor]?.parent ?? null;
    }
  }

  const slugs = new Map<string, string>();
  for (const skill of SKILLS) {
    const slug = slugify(skill.name);
    const clash = slugs.get(slug);
    if (clash) problems.push(`Slug "${slug}" collides: "${clash}" and "${skill.name}".`);
    slugs.set(slug, skill.name);
  }

  return problems;
}

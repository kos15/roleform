/**
 * The deploy-time catalog sync's flow (N25). Never imports lib/db: the store,
 * lock, link check, rebuild and clock are injected, so the flow is tested
 * without a database; `catalog-store.ts` wires the real ones.
 *
 * Runs only when the hash of the seed rows differs from the last `catalog_syncs`
 * row. Only URLs not yet in `courses` are link-checked (N8/N24); a dead one
 * fails the deploy before anything is written. Existing rows get content only —
 * never `status`, `checked_at` or `verified_at` (one-way rule, N8). No model
 * call (N12/N13); logs carry counts, the hash and course URLs only (N7).
 */
import { catalogProblems } from "../../lib/catalog/problems";
import { COURSES } from "../../lib/catalog/courses";
import { SKILLS } from "../../lib/catalog/skills";
import { assertTaxonomy } from "../../lib/catalog/taxonomy";
import { assertTemplates } from "../../lib/render/templates";
import { staggeredCheckedAt } from "../../lib/domain/catalog-refresh";
import type { LinkCheck } from "../../lib/catalog/liveness";
import type { ResourceType } from "../../lib/catalog/quality";
import {
  catalogHash,
  unknownSkillNames,
  type CatalogSeedRows,
  type CourseRow,
  type CourseSkillRow,
  type SkillRow,
  type TemplateRow,
} from "../../lib/catalog/seed-rows";

export const SYNC_CONCURRENCY = 5;
export const SYNC_LOCK_KEY = "roleform_catalog_sync";

export type CourseFields = Omit<CourseRow, "url" | "skills"> & { skillIds: string[] };
export type NewCourseData = CourseFields & { url: string; status: "active"; checkedAt: Date; verifiedAt: Date };

export interface CatalogSyncRecord {
  hash: string;
  courses: number;
  skills: number;
  templates: number;
  bundles: number;
  gitSha: string | null;
}

export interface CatalogStore {
  lastHash(): Promise<string | null>;
  existingUrls(): Promise<Set<string>>;
  writeTemplates(rows: TemplateRow[]): Promise<void>;
  writeSkills(rows: SkillRow[]): Promise<Map<string, string>>;
  createCourse(data: NewCourseData): Promise<string>;
  updateCourse(url: string, data: CourseFields): Promise<string>;
  writeCourseSkills(courseId: string, rows: CourseSkillRow[], skillIdByName: Map<string, string>): Promise<number>;
  record(sync: CatalogSyncRecord): Promise<void>;
}

export type SyncOutcome =
  | { kind: "gated"; problems: string[] }
  | { kind: "unchanged"; hash: string }
  | { kind: "dead"; hash: string; dead: string[] }
  | { kind: "synced"; hash: string; created: number; blocked: string[]; links: number; bundles: number; elapsedMs: number };

export interface SyncDeps {
  rows: CatalogSeedRows;
  store: CatalogStore;
  lock: () => Promise<() => Promise<void>>;
  check: (def: { url: string; type: ResourceType }) => Promise<LinkCheck>;
  rebuild: () => Promise<{ written: number }>;
  gates?: (rows: CatalogSeedRows) => string[];
  today: Date;
  clock: () => number;
  gitSha: string | null;
  log?: (line: string) => void;
  error?: (line: string) => void;
}

/** Everything the manual seed refuses to run on, plus unknown skill names (Ruling 3). */
export function catalogGateProblems(rows: CatalogSeedRows): string[] {
  return [
    ...catalogProblems(COURSES, SKILLS.map((s) => s.name)),
    ...assertTemplates(),
    ...assertTaxonomy(),
    ...unknownSkillNames(rows).map((n) => `Skill name not in the canon: ${n}`),
  ];
}

export function newCourseData(row: CourseRow, index: number, skillIds: string[], today: Date): NewCourseData {
  const { url, skills: _skills, ...written } = row;
  return { url, ...written, skillIds, status: "active", checkedAt: staggeredCheckedAt(today, index), verifiedAt: today };
}

export function existingCourseData(row: CourseRow, skillIds: string[]): CourseFields {
  const { url: _url, skills: _skills, ...written } = row;
  return { ...written, skillIds };
}

export async function syncCatalog(deps: SyncDeps): Promise<SyncOutcome> {
  const { rows, store, check } = deps;
  const log = deps.log ?? ((l: string) => console.log(l));
  const error = deps.error ?? ((l: string) => console.error(l));
  const t0 = deps.clock();

  const problems = (deps.gates ?? catalogGateProblems)(rows);
  if (problems.length > 0) {
    error("[deploy:catalog] catalog has problems:");
    for (const p of problems) error(`  - ${p}`);
    return { kind: "gated", problems };
  }

  const hash = catalogHash(rows);
  const hash8 = hash.slice(0, 8);
  const release = await deps.lock();
  try {
    if ((await store.lastHash()) === hash) {
      log(`[deploy:catalog] unchanged ${hash8}`);
      return { kind: "unchanged", hash };
    }

    const existing = await store.existingUrls();
    const fresh = rows.courses.filter((row) => !existing.has(row.url));
    const freshUrls = new Set(fresh.map((row) => row.url));

    const dead: string[] = [];
    const blocked: string[] = [];
    let next = 0;
    const worker = async () => {
      while (next < fresh.length) {
        const row = fresh[next++];
        const verdict = (
          await check({ url: row.url, type: row.type }).catch((): LinkCheck => ({ liveness: "blocked", authorName: null }))
        ).liveness;
        const label = `${row.provider} — ${row.title} → ${row.url}`;
        if (verdict === "dead") dead.push(label);
        else if (verdict === "blocked") blocked.push(label);
      }
    };
    await Promise.all(Array.from({ length: SYNC_CONCURRENCY }, worker));

    if (dead.length > 0) {
      error(`[deploy:catalog] ${dead.length} new URL(s) returned 404/410 — fix lib/catalog/courses.ts:`);
      for (const d of dead) error(`  - ${d}`);
      return { kind: "dead", hash, dead };
    }

    await store.writeTemplates(rows.templates);
    const idByName = await store.writeSkills(rows.skills);

    const courseSkillsByUrl = new Map<string, CourseSkillRow[]>();
    for (const cs of rows.courseSkills) {
      const list = courseSkillsByUrl.get(cs.courseUrl) ?? [];
      list.push(cs);
      courseSkillsByUrl.set(cs.courseUrl, list);
    }

    let links = 0;
    for (const [index, row] of rows.courses.entries()) {
      const skillIds = row.skills.map((n) => idByName.get(n)!);
      const id = freshUrls.has(row.url)
        ? await store.createCourse(newCourseData(row, index, skillIds, deps.today))
        : await store.updateCourse(row.url, existingCourseData(row, skillIds));
      links += await store.writeCourseSkills(id, courseSkillsByUrl.get(row.url) ?? [], idByName);
    }

    const { written } = await deps.rebuild();
    await store.record({
      hash,
      courses: rows.courses.length,
      skills: rows.skills.length,
      templates: rows.templates.length,
      bundles: written,
      gitSha: deps.gitSha,
    });

    if (blocked.length > 0) {
      log(`[deploy:catalog] ${blocked.length} new URL(s) refused the check and were seeded:`);
      for (const b of blocked) log(`  - ${b}`);
    }
    const elapsedMs = deps.clock() - t0;
    log(
      `[deploy:catalog] synced ${hash8} templates=${rows.templates.length} skills=${rows.skills.length} courses=${rows.courses.length} new=${fresh.length} blocked=${blocked.length} links=${links} bundles=${written} in ${elapsedMs}ms`,
    );
    return { kind: "synced", hash, created: fresh.length, blocked, links, bundles: written, elapsedMs };
  } finally {
    await release();
  }
}

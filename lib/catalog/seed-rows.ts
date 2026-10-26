/**
 * PURE. The one source of catalog rows: the manual seed (`pnpm seed:catalog`)
 * and the deploy-time sync (N25) both write from this, and its hash decides
 * whether the sync has anything to do. No I/O, no clock, no ids, no stamps —
 * `verifiedAt`, `checkedAt` and `status` belong to the writer, not the row.
 */
import { createHash } from "node:crypto";
import { COURSES, type CourseDef } from "./courses";
import { SKILLS, type SkillDef } from "./skills";
import { NODES, type Volatility } from "./taxonomy";
import { levelOf, primacyOf, qualityOf, summaryFor, tagsFor, typeOf, type ResourceType } from "./quality";
import { TEMPLATES, type TemplateDef } from "../render/templates";
import type { StructuralFlags } from "../render/ats-rules";
import type { TemplateKind } from "../domain/types";

/** Bump by hand when seed/bundle logic changes in a way the rows don't show (bundle-rank.ts, QUALITY_FLOOR in rebuild-bundles.ts, write rules). */
export const SEED_FORMAT = 1;

export interface TemplateRow {
  id: string;
  name: string;
  kind: TemplateKind;
  blurb: string;
  accent: string;
  structuralFlags: StructuralFlags;
}

export interface SkillRow {
  name: string;
  category: SkillDef["category"];
  aliases: string[];
  slug: string;
  roadmapPath: string | null;
  depth: number;
  volatility: Volatility;
  parent: string | null;
}

export interface CourseRow {
  url: string;
  provider: string;
  title: string;
  priceLabel: string;
  lengthLabel: string;
  lengthMinutes: number;
  level: CourseDef["level"];
  mark: string;
  isFree: boolean;
  /** Canonical names in authored order; the writer resolves them to skillIds. */
  skills: string[];
  type: ResourceType;
  qualityScore: string;
  tags: string[];
  docKind: "official" | "tutorial" | null;
  isOverview: boolean;
}

export interface CourseSkillRow {
  courseUrl: string;
  skillName: string;
  level: "intro" | "working" | "deep";
  confidence: string;
  isPrimary: boolean;
  summary: string;
}

export interface CatalogSeedRows {
  templates: TemplateRow[];
  skills: SkillRow[];
  courses: CourseRow[];
  courseSkills: CourseSkillRow[];
}

export interface CatalogSource {
  templates: TemplateDef[];
  skills: SkillDef[];
  courses: CourseDef[];
}

/** Row order is source order: the seed's checked_at stagger is keyed on the course's index. */
export function catalogSeedRows(src: CatalogSource = { templates: TEMPLATES, skills: SKILLS, courses: COURSES }): CatalogSeedRows {
  const templates = src.templates.map((t) => ({
    id: t.id,
    name: t.name,
    kind: t.kind,
    blurb: t.blurb,
    accent: t.accent,
    structuralFlags: t.structuralFlags,
  }));

  const skills = src.skills.map((s) => {
    const node = NODES.get(s.name);
    if (!node) throw new Error(`no taxonomy node for ${s.name}`);
    return {
      name: s.name,
      category: s.category,
      aliases: s.aliases,
      slug: node.slug,
      roadmapPath: node.roadmap,
      depth: node.depth,
      volatility: node.volatility,
      parent: node.parent,
    };
  });

  // The learning engine's resource columns are computed (lib/catalog/quality),
  // not authored: a hand-set quality score is a hand-set bundle ranking.
  const courses = src.courses.map((c) => ({
    url: c.url,
    provider: c.provider,
    title: c.title,
    priceLabel: c.priceLabel,
    lengthLabel: c.lengthLabel,
    lengthMinutes: c.lengthMinutes,
    level: c.level,
    mark: c.mark,
    isFree: c.isFree,
    skills: c.skills,
    type: typeOf(c),
    qualityScore: qualityOf(c).toFixed(3),
    tags: tagsFor(c),
    // CHECK courses_doc_needs_kind (type doc => doc_kind not null).
    docKind: c.docKind ?? null,
    isOverview: c.isOverview ?? false,
  }));

  // `skills[0]` is what the course TEACHES; the rest are what it is useful to
  // (primacyOf). Flattened course by course, in each course's skill order.
  const courseSkills = src.courses.flatMap((c) =>
    c.skills.map((skillName) => {
      const primacy = primacyOf(c, skillName);
      return {
        courseUrl: c.url,
        skillName,
        level: levelOf(c),
        confidence: primacy.confidence.toFixed(3),
        isPrimary: primacy.isPrimary,
        summary: summaryFor(c, skillName),
      };
    }),
  );

  return { templates, skills, courses, courseSkills };
}

/** Object keys sorted recursively, array order kept: the hash must not depend on key order. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function catalogHash(rows: CatalogSeedRows, format: number = SEED_FORMAT): string {
  return createHash("sha256").update(stableJson({ format, rows })).digest("hex");
}

/** Course skill names absent from the skill rows, deduped, first-seen order. */
export function unknownSkillNames(rows: CatalogSeedRows): string[] {
  const known = new Set(rows.skills.map((s) => s.name));
  const unknown = new Set<string>();
  for (const course of rows.courses) for (const name of course.skills) if (!known.has(name)) unknown.add(name);
  return [...unknown];
}

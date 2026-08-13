/**
 * Domain vocabulary. Fixed terms (CLAUDE.md §13) — do not introduce synonyms.
 *
 * This module is PURE. It imports nothing from db, ai, supabase or next.
 */

import type { TokenWall } from "./tokens";

export type Necessity = "required" | "preferred" | "implied";
export type CoverageStatus = "evidenced" | "partial" | "absent";
export type RequirementKind =
  | "hard_skill"
  | "soft_skill"
  | "experience"
  | "education"
  | "certification"
  | "responsibility";
export type UserLevel = "none" | "exposure" | "working" | "strong";
export type RequiredLevel = "exposure" | "working" | "strong" | "expert";
/**
 * The template families (CLAUDE.md §5). Eight, not three, since v2.7 added five
 * templates that are genuinely different documents rather than recolours.
 *
 * `kind` is the family a user browses by. `TemplateLayout` below is what the
 * renderers dispatch on — they are 1:1 today except that `editorial` renders as
 * `hanging` and `infographic` as `meter`, because those name the shelf and the
 * construction respectively.
 */
export type TemplateKind =
  | "classic"
  | "sidebar"
  | "creative"
  | "banner"
  | "timeline"
  | "modular"
  | "editorial"
  | "infographic";

/** What the PDF, DOCX and preview renderers switch on. */
export type TemplateLayout =
  | "classic"
  | "sidebar"
  | "creative"
  | "banner"
  | "timeline"
  | "modular"
  | "hanging"
  | "meter";
export type AtsRating = "High" | "Medium" | "Low";
export type Transform = "verbatim" | "rephrase" | "requantify" | "omit";
/** Mirrored from Clerk's publicMetadata; see lib/admin/role.ts. */
export type Role = "member" | "admin";

export interface DomainRequirement {
  id: string;
  kind: RequirementKind;
  text: string;
  necessity: Necessity;
  mentionCount: number;
  skillName: string | null;
  evidenceQuote: string;
}

export interface DomainBullet {
  id: string;
  text: string;
  scope: "work" | "project" | "volunteer" | "education";
  scopeRef: string;
  skillNames: string[];
  recencyMonths: number | null;
}

export interface DomainCoverageItem {
  requirementId: string;
  status: CoverageStatus;
  evidenceBulletIds: string[];
  rationale: string;
}

/* ------------------------------------------------------------------ Result */

export type AppErrorCode =
  | "unauthenticated"
  | "not_found"
  | "invalid_input"
  | "quota_exhausted"
  /**
   * The token meter is empty (F19). Distinct from `quota_exhausted` because it
   * is the one refusal with somewhere to go: the error carries a `wall`, and
   * the UI opens the dialog rather than printing the message inline.
   */
  | "token_wall"
  | "extraction_failed"
  | "no_text_layer"
  | "encrypted_pdf"
  | "schema_invalid"
  | "model_failed"
  | "fabrication_blocked"
  | "storage_failed"
  | "conflict"
  /** A dependency this deployment hasn't been given keys for (F17). */
  | "misconfigured"
  /** A third party we call answered badly, or not at all (F17). */
  | "upstream_failed";

export interface AppError {
  code: AppErrorCode;
  /** User-facing. Must never contain résumé or JD text (N7). */
  message: string;
  detail?: string;
  /**
   * Set only on `token_wall` (F19). Carries the balance, the shortfall, the
   * reset date and every exit — so the dialog is rendered from the same value
   * the enforcement raised, and cannot describe a different wall than the one
   * that stopped the run.
   */
  wall?: TokenWall;
}

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export function appError(code: AppErrorCode, message: string, detail?: string): AppError {
  return { code, message, detail };
}

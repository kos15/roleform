/**
 * Domain vocabulary. Fixed terms (CLAUDE.md §13) — do not introduce synonyms.
 *
 * This module is PURE. It imports nothing from db, ai, supabase or next.
 */

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
export type TemplateKind = "classic" | "sidebar" | "creative";
export type AtsRating = "High" | "Medium" | "Low";
export type Transform = "verbatim" | "rephrase" | "requantify" | "omit";

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
  | "extraction_failed"
  | "no_text_layer"
  | "encrypted_pdf"
  | "schema_invalid"
  | "model_failed"
  | "fabrication_blocked"
  | "storage_failed"
  | "conflict";

export interface AppError {
  code: AppErrorCode;
  /** User-facing. Must never contain résumé or JD text (N7). */
  message: string;
  detail?: string;
}

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export function appError(code: AppErrorCode, message: string, detail?: string): AppError {
  return { code, message, detail };
}

/**
 * The render model. PURE.
 *
 * Both renderers build from this one structure, so a PDF and a DOCX of the same
 * draft can never disagree about content — only about layout. Section order is
 * fixed to the standard headings an ATS maps to fields (ats-rules.ts).
 */
import type { StoredResume } from "@/lib/ai/schemas/resume-json";
import { formatRange } from "./ats-rules";

export interface RenderRole {
  employer: string;
  position: string;
  location: string;
  dates: string;
  bullets: string[];
}

export interface RenderModel {
  name: string;
  headline: string;
  /** Contact as plain body text, never graphics (F9). */
  contactLine: string;
  /**
   * The same parts, unjoined. A single-column template sets them as one line; a
   * rail stacks them. Re-splitting `contactLine` on its separator would break
   * the moment an address contained one.
   */
  contactParts: string[];
  summary: string;
  roles: RenderRole[];
  projects: Array<{ name: string; description: string; bullets: string[]; dates: string }>;
  education: Array<{ institution: string; qualification: string; dates: string }>;
  skills: string[];
  certifications: string[];
}

export interface DraftBullet {
  sourceBulletId: string;
  rewrittenText: string;
  transform: "verbatim" | "rephrase" | "requantify" | "omit";
  /** The text the rewrite was made from — the fallback key when `bulletIds` has no entry. */
  originalText?: string;
}

/** Whitespace and case only: the same sentence, not a similar one. */
function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Builds a draft's render model.
 *
 * `bulletIds` maps "work.0.highlights.1" → experience_bullets.id, so a tailored
 * bullet lands back in the role it came from. Where that map has no entry for a
 * path, the rewrite is found by the original text it was made from (stored on
 * every tailored bullet), still only within the highlight it rewrites — so a
 * missing map entry no longer silently ships the untailored wording. Only when
 * neither matches does the user's original text render — never dropped, and
 * never attached to the wrong employer.
 *
 * Within each role, bullets lead in the order the pipeline ranked them against
 * the posting (`tailored` arrives in that order — CLAUDE.md §3, reorder is a
 * legal transformation). Untailored bullets keep their own order after them.
 */
export function buildRenderModel(args: {
  resume: StoredResume;
  tailored: DraftBullet[];
  orderedSkills: string[];
  summary: string;
}): RenderModel {
  const { resume } = args;
  const bulletIds = resume.x_roleform?.bulletIds ?? {};
  const bySourceId = new Map(args.tailored.map((t) => [t.sourceBulletId, t]));
  const rankBySourceId = new Map(args.tailored.map((t, i) => [t.sourceBulletId, i]));
  const byOriginal = new Map<string, DraftBullet>();
  for (const t of args.tailored) {
    if (t.originalText) byOriginal.set(normalise(t.originalText), t);
  }

  // One highlight list → the bullets a draft prints, ranked and with omits gone.
  const tailorList = (highlights: string[], pathPrefix: string): string[] =>
    highlights
      .map((original, hi) => {
        const id = bulletIds[`${pathPrefix}.highlights.${hi}`];
        const tailoredBullet = (id ? bySourceId.get(id) : undefined) ?? byOriginal.get(normalise(original));
        const rank = tailoredBullet ? (rankBySourceId.get(tailoredBullet.sourceBulletId) ?? Infinity) : Infinity;
        return { hi, rank, tailoredBullet, original };
      })
      .filter((b) => b.tailoredBullet?.transform !== "omit")
      .sort((a, b) => a.rank - b.rank || a.hi - b.hi)
      .map((b) => b.tailoredBullet?.rewrittenText || b.original);
  const hidePhone = resume.x_roleform?.sensitivity.hidePhone ?? false;
  const hideAddress = resume.x_roleform?.sensitivity.hideAddress ?? false;

  const contactParts = [
    resume.basics.email,
    hidePhone ? "" : resume.basics.phone,
    hideAddress
      ? [resume.basics.location.city, resume.basics.location.countryCode].filter(Boolean).join(", ")
      : [resume.basics.location.city, resume.basics.location.region].filter(Boolean).join(", "),
    resume.basics.url,
  ].filter((p) => p && p.trim().length > 0);

  const roles: RenderRole[] = resume.work.map((work, wi) => {
    const bullets = tailorList(work.highlights, `work.${wi}`);

    return {
      employer: work.name,
      position: work.position,
      location: work.location,
      dates: formatRange(work.startDate, work.endDate),
      bullets,
    };
  });

  return {
    name: resume.basics.name,
    headline: resume.basics.label,
    contactLine: contactParts.join(" · "),
    contactParts,
    summary: args.summary || resume.basics.summary,
    roles,
    projects: resume.projects.map((p, pi) => ({
      name: p.name,
      description: p.description,
      dates: p.startDate ? formatRange(p.startDate, p.endDate) : "",
      bullets: tailorList(p.highlights, `projects.${pi}`),
    })),
    education: resume.education.map((e) => ({
      institution: e.institution,
      qualification: [e.studyType, e.area].filter(Boolean).join(", "),
      dates: e.startDate || e.endDate ? formatRange(e.startDate, e.endDate) : "",
    })),
    skills: args.orderedSkills.length > 0 ? args.orderedSkills : resume.skills.map((s) => s.name),
    certifications: resume.certificates.map((c) =>
      [c.name, c.issuer].filter(Boolean).join(" — "),
    ),
  };
}

/** `Firstname-Lastname-Company-Role-Template.docx` (M6.9). */
export function exportFilename(args: {
  name: string;
  company: string;
  role: string;
  templateName: string;
  ext: "pdf" | "docx" | "zip";
}): string {
  const parts = [args.name, args.company, args.role, args.templateName]
    .map(slug)
    .filter((p) => p.length > 0);
  return `${parts.join("-")}.${args.ext}`;
}

function slug(s: string): string {
  return s
    .trim()
    .replace(/[^A-Za-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

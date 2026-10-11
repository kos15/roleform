import { z } from "zod";
import { PORTFOLIO_LOOKS } from "@/lib/domain/portfolio-site";

/**
 * F28 — portfolio site contracts.
 *
 * `PortfolioChoicesSchema` is the user's answers to the brief's clarifying
 * questions (lib/content/portfolio-brief.ts §1). The same answers fill the
 * curated prompt's "Additional instructions" and steer the in-app build, so
 * the two paths cannot disagree about what was asked.
 *
 * Free text here is the user's own words — it may add project detail the
 * résumé lacks (the brief asks for exactly that), so it is part of the
 * fabrication check's source text, never something the check ignores.
 */

/** The fourteen looks the studio renders (lib/render/portfolio/template.ts). */
export const PORTFOLIO_STYLES = PORTFOLIO_LOOKS;
export type PortfolioStyle = (typeof PORTFOLIO_STYLES)[number];

export const PortfolioChoicesSchema = z.object({
  /** Tailor to this analysis's posting, or a broader range of roles. */
  focus: z.enum(["this_role", "broad"]),
  style: z.enum(PORTFOLIO_STYLES),
  emphasis: z.string().trim().max(400),
  projectNotes: z.string().trim().max(1200),
  avoid: z.string().trim().max(400),
  showEmail: z.boolean(),
  showPhone: z.boolean(),
  showLinks: z.boolean(),

  /*
   * Fine-tuning. Every field is optional and empty means "use the profile":
   * a member who answers nothing gets the page their profile implies. The
   * text fields are the member's own words about themselves (§3: theirs to
   * write, never ours); the lists only select and order what the profile has.
   */
  /** Their title on the page, e.g. "Frontend engineer". Empty: the profile's. */
  headline: z.string().trim().max(120).default(""),
  /** One line under the name, in their words. Empty: the summary's first sentence. */
  pitch: z.string().trim().max(200).default(""),
  /** Where they are, as they want it shown. Empty: the profile's. */
  location: z.string().trim().max(80).default(""),
  showLocation: z.boolean().default(true),
  /** Up to three work items to feature, in order (ids from `siteData().pool`). Empty: chosen for the focus. */
  featured: z.array(z.string().max(12)).max(3).default([]),
  /** Show the experience section at all. */
  showExperience: z.boolean().default(true),
  /** Roles to leave off the page (ids from `siteData().roles`). */
  hiddenRoles: z.array(z.string().max(12)).max(20).default([]),
  /** Skills to show, in order. Empty: the profile's, posting-relevant first. */
  skills: z.array(z.string().max(80)).max(16).default([]),
});

export type PortfolioChoices = z.infer<typeof PortfolioChoicesSchema>;

export const DEFAULT_CHOICES: PortfolioChoices = {
  focus: "this_role",
  style: "midnight",
  emphasis: "",
  projectNotes: "",
  avoid: "",
  showEmail: true,
  showPhone: false,
  showLinks: true,
  headline: "",
  pitch: "",
  location: "",
  showLocation: true,
  featured: [],
  showExperience: true,
  hiddenRoles: [],
  skills: [],
};

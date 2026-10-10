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

/** The nine looks the studio renders (lib/render/portfolio/template.ts). */
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
};

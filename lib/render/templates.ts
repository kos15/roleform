/**
 * The six templates across three families (CLAUDE.md §5).
 *
 * Each declares its structural facts; the ATS badge is computed from them
 * (N5) — nobody assigns a rating by hand, and nobody gets to argue with the
 * result. `accent` is the template's own ink, not an organic token: export
 * templates are exempt from the brand (CLAUDE.md §9) because a résumé is the
 * user's document going to a stranger, not a Roleform surface.
 */
import { rateAts, type StructuralFlags } from "./ats-rules";
import type { AtsRating, TemplateKind } from "@/lib/domain/types";

export interface TemplateDef {
  id: string;
  name: string;
  kind: TemplateKind;
  blurb: string;
  accent: string;
  /**
   * Which side the rail sits on. Sidebar templates only — it's what separates
   * Ledger from Margin Note, and the on-screen preview has to agree with the
   * export or the preview is lying about the document.
   */
  rail?: "left" | "right";
  /** The document's own typeface. Not an organic token: a résumé is not a
   *  Roleform surface (CLAUDE.md §9), and Broadsheet's serif is the template. */
  fontStack: string;
  structuralFlags: StructuralFlags;
}

const SANS = "Figtree, system-ui, sans-serif";
const SERIF = 'Georgia, "Times New Roman", serif';

const ALL_CLEAN: StructuralFlags = {
  singleColumnBody: true,
  standardHeadings: true,
  noTablesOrFloats: true,
  contactAsBodyText: true,
  noIconOnlyMeaning: true,
};

export const TEMPLATES: TemplateDef[] = [
  {
    id: "clean-slate",
    name: "Clean Slate",
    kind: "classic",
    blurb: "Single column, standard headings, nothing between your words and the parser.",
    accent: "#1f2933",
    fontStack: SANS,
    structuralFlags: { ...ALL_CLEAN },
  },
  {
    id: "broadsheet",
    name: "Broadsheet",
    kind: "classic",
    blurb: "A serif classic with generous leading. Reads well on paper and parses clean.",
    accent: "#2b2118",
    fontStack: SERIF,
    structuralFlags: { ...ALL_CLEAN },
  },
  {
    id: "ledger",
    name: "Ledger",
    kind: "sidebar",
    blurb: "Skills and contact in a left rail. Easier for a human to skim, harder for a parser.",
    accent: "#1d3a4f",
    rail: "left",
    fontStack: SANS,
    // Two-column body — one violation, so Medium. Honest, not flattering.
    structuralFlags: { ...ALL_CLEAN, singleColumnBody: false },
  },
  {
    id: "margin-note",
    name: "Margin Note",
    kind: "sidebar",
    blurb: "A narrow right rail for dates and skills; the main column stays plain text.",
    accent: "#3c3a52",
    rail: "right",
    fontStack: SANS,
    structuralFlags: { ...ALL_CLEAN, singleColumnBody: false },
  },
  {
    id: "atlas",
    name: "Atlas",
    kind: "creative",
    blurb: "Coloured section bands and an icon contact row. Striking; parses worst of the six.",
    accent: "#0f766e",
    fontStack: SANS,
    structuralFlags: {
      ...ALL_CLEAN,
      singleColumnBody: false,
      noIconOnlyMeaning: false,
      contactAsBodyText: false,
    },
  },
  {
    id: "kite",
    name: "Kite",
    kind: "creative",
    blurb: "Editorial layout with a graphic header. For portfolios and direct applications.",
    accent: "#7c2d12",
    fontStack: SANS,
    structuralFlags: {
      ...ALL_CLEAN,
      singleColumnBody: false,
      noTablesOrFloats: false,
      noIconOnlyMeaning: false,
    },
  },
];

export function templateById(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function ratingFor(id: string): AtsRating {
  const t = templateById(id);
  if (!t) throw new Error(`unknown template: ${id}`);
  return rateAts(t.structuralFlags);
}

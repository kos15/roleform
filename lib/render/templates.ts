/**
 * The eleven templates across eight families (CLAUDE.md §5, design v2.7).
 *
 * Each declares its structural facts; the ATS badge is computed from them
 * (N5) — nobody assigns a rating by hand, and nobody gets to argue with the
 * result. `accent` is the template's own ink, not an organic token: export
 * templates are exempt from the brand (CLAUDE.md §9) because a résumé is the
 * user's document going to a stranger, not a Roleform surface.
 */
import { atsViolations, rateAts, type StructuralFlags } from "./ats-rules";
import type { AtsRating, TemplateKind, TemplateLayout } from "@/lib/domain/types";

export interface TemplateDef {
  id: string;
  name: string;
  /** The family a user browses by. */
  kind: TemplateKind;
  /**
   * What the three renderers switch on. Separate from `kind` because the shelf
   * label and the construction are different facts: Marque is `editorial` on
   * the shelf and `hanging` in the renderer, and conflating them would mean
   * adding a render branch every time a family is renamed.
   */
  layout: TemplateLayout;
  blurb: string;
  /**
   * Why this template earns the rating it does, in the user's language.
   *
   * N5 says the badge is computed, never hand-assigned — and it still is
   * (`ratingFor`). This is the sentence beside the badge, and it is checked
   * against the computed violations by `assertTemplates()`: a blurb claiming
   * "one violation" on a template with two is a lie the seed script refuses to
   * ship. The rating stays computed; only its explanation is written.
   */
  atsWhy: string;
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

/**
 * These stacks name the faces the PDF renderer actually has.
 *
 * `@react-pdf/renderer` ships the PDF base-14 — Helvetica and Times-Roman — and
 * registering a webfont would mean fetching it on every render. So the on-screen
 * preview asks for the same two faces rather than the brand's Figtree: a preview
 * set in a typeface the download can't use is a preview that lies about it.
 */
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const SERIF = '"Times New Roman", Times, serif';

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
    layout: "classic",
    blurb: "Single column, standard headings, nothing between your words and the parser.",
    atsWhy:
      "Single-column body, standard section names, contact as body text — no structural violations.",
    accent: "#1f2933",
    fontStack: SANS,
    structuralFlags: { ...ALL_CLEAN },
  },
  {
    id: "broadsheet",
    name: "Broadsheet",
    kind: "classic",
    layout: "classic",
    blurb: "A serif classic with generous leading. Reads well on paper and parses clean.",
    atsWhy:
      "The same clean structure as Clean Slate; the serif is a typographic choice, not a parsing one.",
    accent: "#2b2118",
    fontStack: SERIF,
    structuralFlags: { ...ALL_CLEAN },
  },
  {
    id: "ledger",
    name: "Ledger",
    kind: "sidebar",
    layout: "sidebar",
    blurb: "Skills and contact in a left rail. Easier for a human to skim, harder for a parser.",
    atsWhy:
      "One violation: a two-column body. Everything else is clean, so it rates Medium — honest, not flattering.",
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
    layout: "sidebar",
    blurb: "A narrow right rail for dates and skills; the main column stays plain text.",
    atsWhy:
      "One violation: the rail makes the body two columns. The main column is still plain text top to bottom.",
    accent: "#3c3a52",
    rail: "right",
    fontStack: SANS,
    structuralFlags: { ...ALL_CLEAN, singleColumnBody: false },
  },
  {
    id: "atlas",
    name: "Atlas",
    kind: "creative",
    layout: "creative",
    blurb: "Coloured section bands and an icon contact row. Striking; parses worst of the set.",
    atsWhy:
      "Three violations: two-column body, icon-only meaning, contact outside body text. Send it to humans, not job boards.",
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
    layout: "creative",
    blurb: "Editorial layout with a graphic header. For portfolios and direct applications.",
    atsWhy:
      "Three violations including floated blocks. Strongest when a hiring manager opens it directly.",
    accent: "#7c2d12",
    fontStack: SANS,
    structuralFlags: {
      ...ALL_CLEAN,
      singleColumnBody: false,
      noTablesOrFloats: false,
      noIconOnlyMeaning: false,
    },
  },

  /* ------------------------------------------------------- added in v2.7 ---
   * Five templates, none of them a recolour. Each earns its rating from a
   * different structural decision, which is the point: a user choosing between
   * eleven layouts should be choosing between eleven trade-offs, not eleven
   * palettes over one document.
   */
  {
    id: "keystone",
    name: "Keystone",
    kind: "banner",
    layout: "banner",
    blurb:
      "A tinted masthead with a monogram, then one plain column. Presence without a second column.",
    atsWhy:
      "The band is decoration above a single-column body; contact stays as real text, so nothing structural breaks.",
    accent: "#7a3b52",
    fontStack: SANS,
    // The interesting one: it LOOKS designed and still rates High. A masthead is
    // only a parsing problem when it carries information the body then omits —
    // so the contact line is repeated as body text underneath it.
    structuralFlags: { ...ALL_CLEAN },
  },
  {
    id: "throughline",
    name: "Throughline",
    kind: "timeline",
    layout: "timeline",
    blurb:
      "Dates run down a left margin against a spine, so nine years read as one continuous line.",
    atsWhy:
      "One violation: dates sit in their own column, which some parsers detach from the role beside them.",
    accent: "#3f5a4c",
    fontStack: SERIF,
    structuralFlags: { ...ALL_CLEAN, singleColumnBody: false },
  },
  {
    id: "blueprint",
    name: "Blueprint",
    kind: "modular",
    layout: "modular",
    blurb: "Every section is a bordered panel on a grid. Scannable in seconds, awkward for a parser.",
    atsWhy:
      "Two violations: a panel grid reads as a table, and the tiled skills panel loses its reading order.",
    accent: "#2a4a7f",
    fontStack: SANS,
    structuralFlags: { ...ALL_CLEAN, singleColumnBody: false, noTablesOrFloats: false },
  },
  {
    id: "marque",
    name: "Marque",
    kind: "editorial",
    layout: "hanging",
    blurb:
      "Oversized name, section labels hung in the left margin, no colour at all. Quiet and confident.",
    atsWhy:
      "One violation: the hanging labels make a two-column grid. No graphics, no colour, standard section names.",
    // Deliberately the body ink rather than a hue. Marque's whole argument is
    // that it does not need one.
    accent: "#201e1d",
    fontStack: SANS,
    structuralFlags: { ...ALL_CLEAN, singleColumnBody: false },
  },
  {
    id: "beacon",
    name: "Beacon",
    kind: "infographic",
    layout: "meter",
    blurb:
      "A dark masthead and proficiency bars for skills. Persuasive to a person, opaque to software.",
    atsWhy:
      "Three violations: reversed-out header, a two-column body, and skill levels carried by bar length rather than words.",
    accent: "#b45309",
    fontStack: SANS,
    structuralFlags: {
      ...ALL_CLEAN,
      singleColumnBody: false,
      contactAsBodyText: false,
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

/**
 * Structural checks the seed script runs before writing a single row.
 *
 * `atsWhy` is prose, and prose drifts from the thing it describes. The rating
 * itself is computed (N5), so the risk is not a wrong badge — it is a correct
 * badge beside a sentence claiming a different number of violations. A user
 * reading "one violation" under a Low badge has been told two different things,
 * and only one of them is true.
 *
 * So the count claimed in words is checked against the count computed from the
 * flags. Cheap, and it is the only place the two representations meet.
 */
const CLAIMED = /\b(no|one|two|three|four|five)\b\s+(?:structural\s+)?violations?/i;
const WORD_TO_N: Record<string, number> = { no: 0, one: 1, two: 2, three: 3, four: 4, five: 5 };

export function assertTemplates(): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();

  for (const t of TEMPLATES) {
    if (ids.has(t.id)) problems.push(`Duplicate template id "${t.id}".`);
    ids.add(t.id);

    const violations = atsViolations(t.structuralFlags).length;
    const claim = CLAIMED.exec(t.atsWhy);
    if (claim) {
      const claimed = WORD_TO_N[claim[1].toLowerCase()];
      if (claimed !== violations) {
        problems.push(
          `${t.name}: atsWhy claims ${claim[1]} violation(s) but the flags compute ${violations} ` +
            `(rating ${rateAts(t.structuralFlags)}).`,
        );
      }
    }

    if (t.rail && t.layout !== "sidebar") {
      problems.push(`${t.name}: rail is a sidebar-only property.`);
    }
  }

  return problems;
}

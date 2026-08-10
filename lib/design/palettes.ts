/**
 * The six palettes (F18). PURE — no I/O, no `next`, importable from anywhere.
 *
 * **A palette is four colours.** Ground, ink, accent, second accent — per mode,
 * and nothing else. Every other token the product reads (the nine-step neutral,
 * accent and second-accent ramps, the dividers, the surfaces, the shadows) is
 * mixed from those four in `app/globals.css`, in perceptual space.
 *
 * That is the whole reason there are six of these and not six hand-built
 * themes: 6 palettes × 2 modes × 54 ramp steps is 648 hexes nobody can keep in
 * step, and the first one that drifts is a contrast bug shipped to a stranger.
 * Four values each, derived the same way, means a palette cannot be internally
 * inconsistent — it can only be a different four values (N9).
 *
 * The hexes here are the ONLY hard-coded colours permitted outside a token
 * (CLAUDE.md §9): this file is where the tokens come from, so it is the one
 * place the rule has nothing to point at.
 *
 * Export templates ignore all of this. A résumé is the user's document going to
 * a stranger's ATS and printer — it stays black on white in every palette
 * (CLAUDE.md §9, §5).
 */

export type PaletteId = "ember" | "ink" | "harbour" | "orchard" | "dusk" | "pine";

export type ThemeMode = "light" | "dark";

/** The four values a mode of a palette sets. Everything else is derived. */
export interface PaletteBases {
  /** `--color-bg` — the ground the whole app sits on. */
  bg: string;
  /** `--color-text` — the ink, and the far end of every neutral mix. */
  text: string;
  /** `--color-accent` — the product's voice. Chrome, primary actions, the mark. */
  accent: string;
  /** `--color-accent-2` — the affirming voice. Evidenced, strong match, met. */
  accent2: string;
}

export interface Palette {
  id: PaletteId;
  name: string;
  /** One line, in the product's voice. Shown on the card in Appearance. */
  mood: string;
  light: PaletteBases;
  dark: PaletteBases;
}

export const PALETTES: Palette[] = [
  {
    id: "ember",
    name: "Ember",
    mood: "The house palette. Cream ground, terracotta, sage second voice.",
    light: { bg: "#f5ead8", text: "#201e1d", accent: "#c67139", accent2: "#7a8a5e" },
    dark: { bg: "#191512", text: "#f4ead9", accent: "#e08a52", accent2: "#9fb27f" },
  },
  {
    id: "ink",
    name: "Ink",
    mood: "Cool paper and indigo, with teal doing the affirming work.",
    light: { bg: "#f0f1f5", text: "#1b1d26", accent: "#4b53c9", accent2: "#1f8f86" },
    dark: { bg: "#12141c", text: "#e6e8f2", accent: "#7d84ee", accent2: "#45b8ad" },
  },
  {
    id: "harbour",
    name: "Harbour",
    mood: "Chalky blue-grey, deep cyan, coral for anything that needs attention.",
    light: { bg: "#e8eef1", text: "#10222b", accent: "#0f7391", accent2: "#d4654a" },
    dark: { bg: "#0d1a21", text: "#e2eef3", accent: "#3aa6c4", accent2: "#f0876a" },
  },
  {
    id: "orchard",
    name: "Orchard",
    mood: "Green-ivory ground, plum, old gold. The warmest of the cool ones.",
    light: { bg: "#eef2e8", text: "#1f2418", accent: "#8a3f6b", accent2: "#a8811f" },
    dark: { bg: "#151a12", text: "#eaf0e2", accent: "#cd77a6", accent2: "#dcb44e" },
  },
  {
    id: "dusk",
    name: "Dusk",
    mood: "Lavender ground with violet and rose — low contrast, late evening.",
    light: { bg: "#eae8f5", text: "#221b2b", accent: "#6d4bb8", accent2: "#c4577b" },
    dark: { bg: "#16111d", text: "#eee6f5", accent: "#a58af0", accent2: "#ef8aa9" },
  },
  {
    id: "pine",
    name: "Pine",
    mood: "Cold green ground, forest accent, mustard second. The quietest.",
    light: { bg: "#e9f0ea", text: "#14201a", accent: "#2f6b4a", accent2: "#b3811a" },
    dark: { bg: "#0f1712", text: "#e4efe7", accent: "#57a97c", accent2: "#dfae4a" },
  },
];

/** The one a new browser gets, and the one "Back to Ember" returns to. */
export const DEFAULT_PALETTE: PaletteId = "ember";

export const PALETTE_STORAGE_KEY = "roleform-palette";
export const THEME_STORAGE_KEY = "roleform-theme";

const IDS = new Set<string>(PALETTES.map((p) => p.id));

/**
 * Narrow whatever came out of `localStorage` or a URL to a palette we ship.
 *
 * Deliberately total rather than throwing: an unknown id is a stale preference
 * from a palette we removed, and the right response to that is Ember, not a
 * blank page.
 */
export function asPaletteId(value: unknown): PaletteId {
  return typeof value === "string" && IDS.has(value) ? (value as PaletteId) : DEFAULT_PALETTE;
}

export function paletteById(id: PaletteId): Palette {
  const found = PALETTES.find((p) => p.id === id);
  if (!found) throw new Error(`unknown palette: ${id}`);
  return found;
}

/** What each of the four bases is for, shown beside the picker. */
export const PALETTE_ANATOMY: { token: string; name: string; role: string }[] = [
  {
    token: "var(--color-bg)",
    name: "Ground",
    role: "the page, and the far end of every tint",
  },
  {
    token: "var(--color-text)",
    name: "Ink",
    role: "body copy, and the far end of every shade",
  },
  {
    token: "var(--color-accent)",
    name: "Accent",
    role: "chrome, primary actions, the mark, Not evidenced",
  },
  {
    token: "var(--color-accent-2)",
    name: "Second accent",
    role: "Strong match, met levels, anything affirming",
  },
];

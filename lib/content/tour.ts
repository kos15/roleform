/**
 * The walkthrough (design v2 — the `TOUR` array).
 *
 * Six steps, each anchored to a `data-tour` attribute that already exists on a
 * real surface. The tour never renders a step whose anchor isn't on the page:
 * a spotlight over nothing is a lie about where a control is.
 *
 * The copy is the design's, with one deliberate edit. The design's last step
 * reads "Eleven drafts, one set of facts"; how many drafts a run returns is
 * `capResumes` per member (CLAUDE.md §5, F15), so a fixed number in a heading
 * is wrong for somebody. It counts nothing instead.
 */
export interface TourStep {
  /** Matches `[data-tour="…"]` on the surface this step is about. */
  key: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    key: "tokens",
    title: "Your allowance, in the header",
    body: "Every run draws tokens from this ring. It empties as you work and refills on the cycle date — never an opaque “analyses left” count.",
  },
  {
    key: "jd",
    title: "Start with the posting",
    body: "Drop the file or paste the text. Nothing is matched or rewritten until the whole posting has been read.",
  },
  {
    key: "score",
    title: "Coverage, not a prediction",
    body: "The ring is how much of this posting your own profile can evidence. It is not an ATS score, and no employer system produced it.",
  },
  {
    key: "coverage",
    title: "Every requirement, sorted by evidence",
    body: "Evidenced, partial, absent. Open any requirement to see the bullet it matched and the line in the posting that asked for it.",
  },
  {
    key: "tabs",
    title: "Three ways to use one analysis",
    body: "Résumés, interview prep and a learning plan — all drawn from the same match, so they can never disagree with each other.",
  },
  {
    key: "shelf",
    title: "Every draft, one set of facts",
    body: "Each template carries an ATS rating computed from its structure, with the reason beside it. You are choosing a layout, not a promise.",
  },
];

/** Where the walkthrough starts when the current page has nothing to point at. */
export const TOUR_HOME = "/analyze";

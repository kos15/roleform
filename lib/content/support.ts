/**
 * The "support us" page (F12).
 *
 * The design publishes a spend breakdown, and publishing one is the right
 * instinct — a product that vets courses should say who pays for the vetting.
 * But we have not taken a quarter of money yet, so these are stated as the
 * PLANNED allocation, not as last quarter's actuals. The moment there are
 * actuals, swap the numbers and change `basis` to say so. Presenting a forecast
 * as a report would be exactly the kind of confident-sounding lie the rest of
 * this product refuses to tell.
 */

export interface SupportTier {
  name: string;
  price: string;
  unit: string;
  description: string;
  cta: string;
  /** The one we'd actually like you to pick. Gets the primary button. */
  featured?: boolean;
}

export const SUPPORT_TIERS: SupportTier[] = [
  {
    name: "Coffee",
    price: "₹200",
    unit: "one-off",
    description: "A one-time thank you. No account changes, no badge, no strings.",
    cta: "Buy a coffee",
  },
  {
    name: "Supporter",
    price: "₹400",
    unit: "per month",
    description:
      "Covers roughly one member's pipeline runs for a month. Cancel whenever, from the profile page.",
    cta: "Become a supporter",
    featured: true,
  },
  {
    name: "Sponsor",
    price: "Custom",
    unit: "annual",
    description:
      "For career centres and coaching practices. Includes catalog review sessions.",
    cta: "Talk to us",
  },
];

export const SPEND_BASIS = "Planned allocation, not a report — we haven't taken a full quarter yet.";

export interface SpendLine {
  label: string;
  pct: number;
  note: string;
}

/**
 * Vetting leads, though compute is the larger line.
 *
 * Not a sort order — an argument. The sentence above this list says a product
 * that vets courses should be able to say who pays for the vetting, and the
 * first row under that sentence should be the vetting. Ordering by percentage
 * would put the least surprising number first and bury the claim.
 */
export const SUPPORT_SPEND: SpendLine[] = [
  {
    label: "Course catalog vetting",
    pct: 38,
    note: "Someone takes each course before it can be recommended.",
  },
  {
    label: "Pipeline compute",
    pct: 41,
    note: "Reading, matching, rewriting and drafting.",
  },
  {
    label: "Hosting and storage",
    pct: 21,
    note: "One region, plus backups you can delete.",
  },
];

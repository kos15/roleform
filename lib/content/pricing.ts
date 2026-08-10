/**
 * The three plans and the one-off token packs (F17, F19). PURE — no I/O, no `next`, importable from anywhere.
 *
 * **The plan IS its caps.** Each row of the comparison table is a `QuotaKey`,
 * and the number beside it is the number the code will actually enforce at that
 * cap's own seam (F15). There is no marketing copy here describing a limit in
 * words — a sentence and a constraint drift, and the sentence is the one people
 * read before paying.
 *
 * That is the same rule the résumé side of this product runs on: the page may
 * only say what something can evidence. Here the evidence is `users.cap_*`.
 */

import { QUOTAS, type QuotaKey } from "@/lib/domain/quotas";
import { RUN_ESTIMATE, formatCount } from "@/lib/domain/tokens";

export type PlanId = "free" | "pro" | "ultra";

export interface Plan {
  id: PlanId;
  name: string;
  /** Rendered as-is. "₹0" rather than "Free" so the columns align. */
  price: string;
  /** Paise, because that is the unit Razorpay charges in. 0 for Free. */
  pricePaise: number;
  unit: string;
  tagline: string;
  /** Exactly the caps an account on this plan holds. */
  caps: Record<QuotaKey, number>;
  cta: string;
  /** The one we would like you to pick. Gets the primary button. */
  featured?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "₹0",
    pricePaise: 0,
    unit: "forever",
    tagline:
      "Enough to tailor a résumé against a posting properly, and to see whether the gap list tells you anything you didn't know.",
    caps: { tokens: 60_000, analyses: 3, resumes: 2, answers: 3, courses: 2 },
    cta: "Start free",
  },
  {
    id: "pro",
    name: "Pro",
    price: "₹499",
    pricePaise: 49_900,
    unit: "per month",
    tagline:
      "For an actual search — several postings a week, all six templates, and a worked answer for every question rather than a framework.",
    caps: { tokens: 800_000, analyses: 40, resumes: 6, answers: 40, courses: 4 },
    cta: "Go Pro",
    featured: true,
  },
  {
    id: "ultra",
    name: "Ultra",
    price: "₹1,299",
    pricePaise: 129_900,
    unit: "per month",
    tagline:
      "For coaches and career centres running many searches at once, where the meter is the thing that actually binds.",
    caps: { tokens: 3_000_000, analyses: 150, resumes: 6, answers: 200, courses: 6 },
    cta: "Go Ultra",
  },
];

export function planById(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`unknown plan: ${id}`);
  return plan;
}

/**
 * The plan above this one, or null at the top (F19).
 *
 * Read by the token wall to decide whether the "move up a plan" exit exists at
 * all. Derived from the list order rather than hard-coded, so adding a tier is
 * one entry above and nothing else.
 */
export function planAbove(id: PlanId): Plan | null {
  const i = PLANS.findIndex((p) => p.id === id);
  return i >= 0 && i < PLANS.length - 1 ? PLANS[i + 1] : null;
}

/**
 * One-off token packs (F19).
 *
 * **They never renew and they never expire.** That is the only thing that
 * distinguishes a top-up from a cap: the plan allowance does not carry across a
 * cycle and an unspent top-up does (the carry rule lives in
 * lib/db/queries/tokens.ts), so buying one late in a month is not a partial
 * purchase. A pack that expired at the turnover would be a
 * worse cap sold at a higher price.
 *
 * Free accounts cannot buy them. A top-up is a release valve on a plan you are
 * already paying for, not a way to buy the product one run at a time — and
 * "you can top up forever" is how a free tier stops being a free tier.
 */
export interface Topup {
  id: string;
  tokens: number;
  price: string;
  pricePaise: number;
  note: string;
}

export const TOPUPS: Topup[] = [
  {
    id: "topup-100k",
    tokens: 100_000,
    price: "₹99",
    pricePaise: 9_900,
    note: `About ${Math.floor(100_000 / RUN_ESTIMATE)} more full analyses`,
  },
  {
    id: "topup-300k",
    tokens: 300_000,
    price: "₹249",
    pricePaise: 24_900,
    note: `About ${Math.floor(300_000 / RUN_ESTIMATE)} more full analyses`,
  },
];

export function topupById(id: string): Topup | null {
  return TOPUPS.find((t) => t.id === id) ?? null;
}

/** Plans that can buy a top-up. Free cannot — see the note on `TOPUPS`. */
export function canBuyTopup(planId: PlanId): boolean {
  return planId !== "free";
}

/**
 * One row of the comparison table.
 *
 * `note` is what the cap does when you reach it, not a feature bullet. A person
 * deciding between two plans is really asking "what happens when I run out",
 * and every one of these answers is already true in the code (F15) — the
 * frameworks really do stay free at zero, the gap really is shown with no
 * course beside it.
 */
export interface PlanRow {
  key: QuotaKey;
  label: string;
  unit: string;
  note: string;
}

const NOTES: Record<QuotaKey, string> = {
  tokens: `Measured from what the models actually consumed — a full run is about ${formatCount(RUN_ESTIMATE)}. When it empties we stop before the first stage rather than half-run an analysis and bill you for it.`,
  analyses: "Analyses you have already run stay readable at any cap.",
  resumes: "Below six is fewer drafts, never worse ones — highest-ATS first.",
  answers: "Every question keeps its framework and its source bullets, at every cap including zero.",
  courses: "The gap is always shown, with or without a course beside it.",
};

export const PLAN_ROWS: PlanRow[] = QUOTAS.map((q) => ({
  key: q.key,
  label: q.label,
  unit: q.unit,
  note: NOTES[q.key],
}));

/**
 * What the page will not claim, stated on the page (F17).
 *
 * Every other surface in this product publishes its refusals — the four
 * pipeline stages do it, the score does it, the templates do it. A pricing page
 * is where a product is most tempted to stop, which is the reason to do it here
 * too.
 */
export const PRICING_REFUSALS: string[] = [
  "Nothing upgrades itself. Running out of tokens opens a dialog with three exits and takes none of them for you — we will not silently bill you for the next tier to keep a run going.",
  "We do not throttle you quietly. A run that cannot be afforded is refused before its first stage, with the shortfall and the reset date on the screen.",
  "Paying does not change the match score. It is requirement coverage — a fact about your own document — and money cannot move it.",
  "Paying does not add experience to your profile. Nothing is invented on either plan.",
  "No plan gets a better model, a better parser or a nicer rewrite. The pipeline is the same one.",
  "Cancel whenever, from your profile. You keep read access to everything already generated.",
];

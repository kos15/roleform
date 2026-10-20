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

import { QUOTAS, displayCap, type QuotaKey } from "@/lib/domain/quotas";
import { RUN_ESTIMATE, formatCount } from "@/lib/domain/tokens";
import type { PlanId } from "@/lib/domain/types";

export type { PlanId };

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

/**
 * The DEFAULT catalog (F31). An admin can override any of these from the
 * panel; the live catalog is `loadPlans()` in lib/plans/catalog.ts, which
 * reads `plan_configs` and falls back to these rows for any plan nobody has
 * edited. Pure code that only needs ids or ordering may still read this.
 */
export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "₹0",
    pricePaise: 0,
    unit: "forever",
    tagline: "Tailor against a real posting and see your gaps.",
    caps: { tokens: 300_000, analyses: 3, resumes: 2, answers: 3, courses: 2, roadmaps: 1, jobSearches: 0, practice: 3 },
    cta: "Start free",
  },
  {
    id: "pro",
    name: "Pro",
    price: "₹499",
    pricePaise: 49_900,
    unit: "per month",
    tagline: "For an active search: every template, answers, roadmaps and job search.",
    caps: { tokens: 3_960_000, analyses: 40, resumes: 11, answers: 40, courses: 4, roadmaps: 40, jobSearches: 60, practice: 40 },
    cta: "Go Pro",
    featured: true,
  },
  {
    id: "ultra",
    name: "Ultra",
    price: "₹1,299",
    pricePaise: 129_900,
    unit: "per month",
    tagline: "For coaches and career centres running many searches.",
    caps: { tokens: 15_150_000, analyses: 150, resumes: 11, answers: 200, courses: 6, roadmaps: 150, jobSearches: 200, practice: 150 },
    cta: "Go Ultra",
  },
];

export const PLAN_IDS: PlanId[] = ["free", "pro", "ultra"];

/** `49900` → `₹499`, `129900` → `₹1,299`. Indian grouping, no paise when whole. */
export function formatPrice(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** The default row for a plan — see `loadPlan` for the live one. */
export function planById(id: PlanId, plans: Plan[] = PLANS): Plan {
  const plan = plans.find((p) => p.id === id);
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
export function planAbove(id: PlanId, plans: Plan[] = PLANS): Plan | null {
  const i = plans.findIndex((p) => p.id === id);
  return i >= 0 && i < plans.length - 1 ? plans[i + 1] : null;
}

/**
 * Extra-analysis packs (F19, counts-only pricing Oct 2026).
 *
 * **They never renew and they never expire.** That is the only thing that
 * distinguishes a pack from a cap: the month's analyses do not carry across a
 * cycle and unspent extra analyses do (`analysesAvailable` in
 * lib/domain/entitlements.ts), so buying one late in a month is not a partial
 * purchase. A pack that expired at the turnover would be a worse cap sold at a
 * higher price.
 *
 * Free accounts cannot buy them. A top-up is a release valve on a plan you are
 * already paying for, not a way to buy the product one run at a time — and
 * "you can top up forever" is how a free tier stops being a free tier.
 */
export interface Topup {
  id: string;
  /** Extra analyses the pack adds. Spent only after the month's cap runs out. */
  analyses: number;
  price: string;
  pricePaise: number;
  note: string;
}

export const TOPUPS: Topup[] = [
  { id: "topup-5a", analyses: 5, price: "₹99", pricePaise: 9_900, note: "Never expires" },
  { id: "topup-15a", analyses: 15, price: "₹249", pricePaise: 24_900, note: "Never expires" },
];

/**
 * The token packs sold before counts-only pricing (Oct 2026). Not on sale —
 * kept only so an order placed before the switch and paid after it is still
 * credited by the webhook, with exactly what was bought.
 */
export const LEGACY_TOKEN_TOPUPS: Array<{ id: string; tokens: number; pricePaise: number }> = [
  { id: "topup-100k", tokens: 100_000, pricePaise: 9_900 },
  { id: "topup-300k", tokens: 300_000, pricePaise: 24_900 },
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
  resumes: "Below eleven is fewer drafts, never worse ones — highest-ATS first.",
  answers: "Every question keeps its framework and its source bullets, at every cap including zero.",
  courses: "The gap is always shown, with or without a course beside it.",
  roadmaps: "A roadmap you have built stays readable and tickable at any cap.",
  jobSearches: "Saved jobs and their statuses stay at any cap, including Off.",
  practice: "Decks and rounds you have built stay usable at any cap; reviewing a challenge you started is free.",
};

export const PLAN_ROWS: PlanRow[] = QUOTAS.map((q) => ({
  key: q.key,
  label: q.label,
  unit: q.unit,
  note: NOTES[q.key],
}));

/**
 * The "Side by side" table (F17).
 *
 * Every row here is a number the code enforces at a seam — the five caps, plus
 * the two facts about top-ups. The design's own table carries three more rows
 * (DOCX vs "PDF only", before/after diff, multiple profiles) and they are
 * deliberately absent: nothing gates export or the diff by plan, and multiple
 * profiles do not exist at all (D1). Printing them would put a claim on the
 * pricing page that no constraint backs, which is the exact failure this page's
 * "a plan IS its caps" rule exists to prevent.
 *
 * If those three are ever wanted, they arrive as enforcement first and a row
 * second — in that order, never the reverse.
 */
export interface CompareRow {
  label: string;
  unit: string;
  /** One cell per plan, in PLANS order. */
  cells: string[];
}

export function compareRows(plans: Plan[] = PLANS): CompareRow[] {
  return [
    ...QUOTAS.map((q) => ({
      label: q.label,
      unit: q.unit,
      cells: plans.map((p) => displayCap(q.key, p.caps[q.key])),
    })),
    {
      label: "What a full run costs",
      unit: "about, measured from ai_runs",
      cells: plans.map(() => formatCount(RUN_ESTIMATE)),
    },
    {
      label: "One-off top-ups",
      unit: "never renew, never expire",
      cells: plans.map((p) => (canBuyTopup(p.id) ? "✓" : "—")),
    },
  ];
}

/** The default catalog's table. Pages with the live catalog call `compareRows(plans)`. */
export const COMPARE_ROWS: CompareRow[] = compareRows();

/**
 * Billing questions (F17). Each answer is a fact the code enforces — the
 * 30-day stack is the Razorpay webhook, the lapse is `settlePlan`, the floor
 * on a promo is `MIN_CHARGE_PAISE`. Rendered as an accordion on /pricing, as
 * FAQPage JSON-LD, and in the Markdown mirror, so all three say one thing.
 */
export const BILLING_FAQ: { q: string; a: string }[] = [
  {
    q: "Do I need a card to start?",
    a: "No. Free needs an account and nothing else — no card on file, no trial clock. Pay only when you want a paid plan's caps.",
  },
  {
    q: "Does a paid plan renew itself?",
    a: "No. A plan lasts 30 days from payment and then drops back to Free on its own. There is no subscription to cancel and nothing is charged again unless you pay again.",
  },
  {
    q: "What if I renew before the 30 days are up?",
    a: "The new 30 days start where the current ones end, so renewing early never loses a day you already paid for.",
  },
  {
    q: "What happens when a plan ends?",
    a: "Your caps return to Free's. Everything already generated — analyses, résumés, answers, roadmaps, saved jobs — stays readable.",
  },
  {
    q: "How do promo codes work?",
    a: "Enter a code on a plan card, or follow a link that carries one. The discounted price is worked out on our server before you pay and is the amount charged — one code per order.",
  },
  {
    q: "How do I pay, and in what currency?",
    a: "Payments go through Razorpay, in Indian rupees (INR), inclusive of tax. If your card is in another currency, your bank converts the charge at its own rate.",
  },
];

/**
 * What the page will not claim, stated on the page (F17).
 *
 * Every other surface in this product publishes its refusals — the four
 * pipeline stages do it, the score does it, the templates do it. A pricing page
 * is where a product is most tempted to stop, which is the reason to do it here
 * too.
 */
export const PRICING_REFUSALS: string[] = [
  "Nothing upgrades itself. Running out opens a dialog; the choice stays yours.",
  "No quiet throttling. A run you can't afford is refused before it starts, with the shortfall shown.",
  "Money can't move the match score — it's coverage of your own document.",
  "Paying adds no experience. Nothing is invented on any plan.",
  "Same models, same parser, same pipeline on every plan.",
  "Nothing renews itself. A plan lasts 30 days; you keep everything already made.",
  "Roadmap and job search are gated by plan, not by quality.",
]

/**
 * The two plans (F17). PURE — no I/O, no `next`, importable from anywhere.
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

export type PlanId = "free" | "pro";

export interface Plan {
  id: PlanId;
  name: string;
  /** Rendered as-is. "₹0" rather than "Free" so the two columns align. */
  price: string;
  unit: string;
  tagline: string;
  /** Exactly the caps an account on this plan holds. */
  caps: Record<QuotaKey, number>;
  cta: string;
  /** The one we would like you to pick. Gets the primary button. */
  featured?: boolean;
}

/** Paise, because that is the unit Razorpay charges in. ₹400 → 40000. */
export const PRO_PRICE_PAISE = 40_000;

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "₹0",
    unit: "forever",
    tagline:
      "Enough to tailor a résumé against a posting properly, and to see whether the gap list tells you anything you didn't know.",
    caps: { analyses: 10, resumes: 2, answers: 0, courses: 2 },
    cta: "Start free",
  },
  {
    id: "pro",
    name: "Pro",
    price: "₹400",
    unit: "per month",
    tagline:
      "For an actual search — several postings a week, all six templates, and a worked answer for every question rather than a framework.",
    caps: { analyses: 40, resumes: 6, answers: 40, courses: 4 },
    cta: "Go Pro",
    featured: true,
  },
];

export function planById(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`unknown plan: ${id}`);
  return plan;
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
  "Paying does not change the match score. It is requirement coverage — a fact about your own document — and money cannot move it.",
  "Paying does not add experience to your profile. Nothing is invented on either plan.",
  "No plan gets a better model, a better parser or a nicer rewrite. The pipeline is the same one.",
  "Cancel whenever, from your profile. You keep read access to everything already generated.",
];

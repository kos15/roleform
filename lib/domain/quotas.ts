/**
 * Generation caps (F15). PURE.
 *
 * Four separate caps rather than one credit balance, because the four things
 * cost different amounts and fail at different seams. A member who has run out
 * of answer drafts has not run out of analyses, and telling them they have is
 * the generic-error failure this whole feature exists to remove.
 *
 * The bounds here are mirrored by CHECK constraints on `users` — the migration
 * is the enforcement, this is the vocabulary (CLAUDE.md §11).
 *
 * `tokens` (F19) joined the list last and sits first, because it is the only
 * one of the five that measures what a run actually costs rather than how many
 * of them there were. The other four still exist: they fail at different seams
 * and say different things, and folding them into one credit balance would
 * bring back exactly the generic refusal F15 was built to remove.
 */

import { UNCAPPED } from "./entitlements";
import { formatTokens } from "./tokens";

export type QuotaKey =
  | "tokens"
  | "analyses"
  | "resumes"
  | "answers"
  | "courses"
  | "roadmaps"
  | "jobSearches"
  | "practice";

export type QuotaPeriod = "cycle" | "analysis" | "gap";

export interface QuotaDefinition {
  key: QuotaKey;
  /** Column on `users`. */
  column:
    | "capTokens"
    | "capAnalyses"
    | "capResumes"
    | "capAnswers"
    | "capCourses"
    | "capRoadmaps"
    | "capJobSearches"
    | "capPractice";
  label: string;
  unit: string;
  period: QuotaPeriod;
  step: number;
  min: number;
  max: number;
  /** Six figures read as noise at full length. "800K" everywhere but the wall. */
  abbreviate?: boolean;
  /**
   * Not printed to members (CLAUDE.md N22, amended Oct 2026): a fair-use
   * ceiling sized so every printed count binds first. Only `tokens`.
   */
  internal?: true;
  description: string;
}

export const QUOTAS: QuotaDefinition[] = [
  {
    key: "tokens",
    column: "capTokens",
    label: "Fair-use limit",
    unit: "per month",
    period: "cycle",
    step: 50_000,
    min: 0,
    max: 20_000_000,
    abbreviate: true,
    internal: true,
    description:
      "The real meter. Every stage of every run draws from it, measured from what the models actually consumed. When it empties the member is offered a wait, a top-up or a plan — never a silent failure.",
  },
  {
    key: "analyses",
    column: "capAnalyses",
    label: "JD analyses",
    unit: "per month",
    period: "cycle",
    step: 5,
    min: 0,
    max: 200,
    description:
      "A full pipeline run — reading, matching, rewriting, preparing. The most expensive thing this product does.",
  },
  {
    key: "resumes",
    column: "capResumes",
    label: "Résumés rendered",
    unit: "per analysis",
    period: "analysis",
    step: 1,
    min: 0,
    max: 11,
    description:
      "How many of the eleven templates render on each run. Below eleven we render the highest-ATS ones first.",
  },
  {
    key: "answers",
    column: "capAnswers",
    label: "Full answer drafts",
    unit: "per month",
    period: "cycle",
    step: 5,
    min: 0,
    max: 200,
    description:
      "Long-form answers drafted from the member's own bullets. Frameworks stay free — only the drafted answer counts.",
  },
  {
    key: "courses",
    column: "capCourses",
    label: "Course matches",
    unit: "per gap",
    period: "gap",
    step: 1,
    min: 0,
    max: 6,
    description:
      "Vetted catalog matches returned per unevidenced requirement. Gaps are always shown, with or without courses.",
  },
  {
    key: "roadmaps",
    column: "capRoadmaps",
    label: "Roadmaps built",
    unit: "per month",
    period: "cycle",
    step: 5,
    min: 0,
    max: 200,
    description:
      "The checklist compiled from an analysis's own rows — costs zero tokens, so this cap is the only limiter. A roadmap you have built stays readable and tickable at any cap.",
  },
  {
    key: "jobSearches",
    column: "capJobSearches",
    label: "Job searches",
    unit: "per month",
    period: "cycle",
    step: 10,
    min: 0,
    max: 500,
    description:
      "Listings fetched from job-board APIs against your profile's titles and skills. Off on Free. Saved jobs and their statuses stay at any cap, including Off.",
  },
  {
    key: "practice",
    column: "capPractice",
    label: "Practice sessions",
    unit: "per month",
    period: "cycle",
    step: 5,
    min: 0,
    max: 200,
    description:
      "Rapid prep: building a revision deck, starting a quiz round or a coding challenge each count one. Reviews inside a challenge are free. Decks and rounds you have stay usable at any cap.",
  },
];

export const QUOTA_BY_KEY: Record<QuotaKey, QuotaDefinition> = Object.fromEntries(
  QUOTAS.map((q) => [q.key, q]),
) as Record<QuotaKey, QuotaDefinition>;

/** Snap an admin's typed or clicked value into the constraint the column carries. */
export function clampCap(key: QuotaKey, value: number): number {
  const def = QUOTA_BY_KEY[key];
  if (!Number.isFinite(value)) return def.min;
  return Math.min(def.max, Math.max(def.min, Math.round(value)));
}

/**
 * 0 is a real setting, and it reads as a word rather than a number.
 *
 * Takes the key as well as the value because the token allowance is six digits
 * and every other cap is one or two: "800,000" beside "6" makes the column
 * about the token row, so that one abbreviates. The wall and the ledger — the
 * two places a member might check our arithmetic — use `formatCount` instead
 * and print it in full.
 */
export function displayCap(key: QuotaKey, value: number): string {
  // An admin's ceiling is not a number (lib/domain/entitlements.ts), and
  // formatting Infinity as "∞" or "1.8e308" are both worse than the word.
  if (value === UNCAPPED) return "Unlimited";
  if (value === 0) return "Off";
  if (!QUOTA_BY_KEY[key].abbreviate) return String(value);
  return formatTokens(value);
}

/**
 * The billing cycle is a rolling 30 days. Calendar months would make a cap mean
 * something different in February.
 *
 * Also the bucket width the token carry rule uses to work out how much of each
 * past cycle overran its allowance (lib/db/queries/tokens.ts). Exported so
 * there is one number rather than a 30 in a SQL string that nobody greps for.
 */
export const CYCLE_DAYS = 30;

/**
 * The start of the cycle running now, from the account's anchor.
 *
 * **Walks in both directions on purpose.** `users.quota_resets_at` is a fixed
 * point the cycles are laid out around — it is not maintained by a scheduler,
 * because there isn't one (CLAUDE.md §8) — so it can be in the past (an anchor
 * set at signup, which is what `provisionUser` writes) or in the future (a
 * reset date recorded by hand). Only walking back handles the second case, and
 * the first is now the common one: an account created 90 days ago would
 * otherwise report a cycle that started at signup and a usage total covering
 * its whole life.
 *
 * A null anchor still falls through to `now`, but that is a defensive fallback
 * rather than the normal path — a null anchor means usage counts from this
 * instant, so every cap reads zero-used and nothing binds. `provisionUser`
 * writes the anchor, and the F19 migration backfills the rows that predate it.
 */
export function cycleStart(quotaResetsAt: Date | null, now: Date = new Date()): Date {
  const start = new Date(quotaResetsAt ?? now);
  while (start > now) start.setDate(start.getDate() - CYCLE_DAYS);
  // Roll forward to the window `now` is actually in.
  for (;;) {
    const next = new Date(start);
    next.setDate(next.getDate() + CYCLE_DAYS);
    if (next > now) break;
    start.setTime(next.getTime());
  }
  return start;
}

/**
 * When the allowance refills — the date every token refusal names (F19).
 *
 * Derived from `cycleStart` rather than walked separately: two dates that are
 * meant to be one cycle apart eventually aren't, and this one goes in front of
 * a member who is being told to wait for it.
 */
export function cycleEnd(quotaResetsAt: Date | null, now: Date = new Date()): Date {
  const end = cycleStart(quotaResetsAt, now);
  end.setDate(end.getDate() + CYCLE_DAYS);
  return end;
}

/* ----------------------------------------------------------------- the cap wall */

/**
 * One exit out of a cap wall that isn't the reset. `TokenWall`'s `upgrade`
 * shape, narrowed to what a count-based cap needs — a plan and the number it
 * would carry for this exact key (F23, PAY-4).
 */
export interface CapWallOffer {
  id: string;
  name: string;
  price: string;
  cap: number;
}

/**
 * Everything a cap-refusal dialog needs, computed on the server (F23).
 *
 * The mirror of `TokenWall` for the four cyclical, count-based caps
 * (analyses, answers, roadmaps, jobSearches — never resumes or courses,
 * which are bounded at write time, never refused up front). A refusal that
 * says "quota exceeded" is the failure F15 removed once; PAY-5 says every
 * cap refusal carries this value so the UI never has to guess which wall it
 * is rendering.
 *
 * Built in `lib/auth.ts#buildCapWall`, which has the I/O (`listAdmins`,
 * `planAbove`) this type deliberately does not — this file stays PURE.
 */
export interface CapWall {
  key: QuotaKey;
  label: string;
  period: QuotaPeriod;
  cap: number;
  used: number;
  /** Cycle caps only. Empty string for `resumes`/`courses`, which never wall. */
  resetDate: string;
  resetIn: string;
  /** The plan above this member's, and what it would carry for this key. Null at the top. */
  upgrade: CapWallOffer | null;
  /** Admin names who can raise the cap by hand. Empty when none are configured. */
  admins: string[];
}

/**
 * The once-a-cycle low-count warning (counts-only pricing). Speaks in the
 * counts members see — never tokens. Checks analyses, then answers, then
 * practice; a count that is Off for the plan (`null`) never warns, because
 * "you have none left" of something you never had is not news.
 */
const LOW_NOUNS = {
  analyses: { one: "analysis", many: "analyses" },
  answers: { one: "full answer draft", many: "full answer drafts" },
  practice: { one: "practice session", many: "practice sessions" },
} as const;

export function lowCountNotice(left: {
  analyses: number | null;
  answers: number | null;
  practice: number | null;
}): { key: keyof typeof LOW_NOUNS; empty: boolean; text: string } | null {
  for (const key of ["analyses", "answers", "practice"] as const) {
    const n = left[key];
    if (n === null || n > 1) continue;
    const noun = LOW_NOUNS[key];
    return n <= 0
      ? { key, empty: true, text: `You've used this cycle's ${noun.many}.` }
      : { key, empty: false, text: `1 ${noun.one} left this cycle.` };
  }
  return null;
}

/**
 * The changelog (F12).
 *
 * Grounded in what this repo actually shipped, in the order it shipped. Fixes
 * are listed as plainly as features, and the version tag says which kind of
 * release it was — a changelog that only records the good news is marketing
 * with a date column.
 */

export type ReleaseKind = "Release" | "Feature" | "Improvement" | "Fix";

export interface Release {
  version: string;
  date: string;
  kind: ReleaseKind;
  items: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: "2.4",
    date: "30 July 2026",
    kind: "Feature",
    items: [
      "Per-member generation controls for workspace admins — analyses, résumés, answer drafts and course matches, each capped separately.",
      "Hitting a cap now names the cap and the admins who can raise it, instead of failing generically.",
      "A status page that reports health per pipeline stage, read back out of what actually ran rather than hand-set by us.",
      "Written pages you can read without an account: how it works, privacy, terms, changelog and contact.",
    ],
  },
  {
    version: "2.3",
    date: "30 July 2026",
    kind: "Improvement",
    items: [
      "Dark mode across every screen, derived from the same token ramps rather than a second palette.",
      "The parsing screen draws what each stage is doing instead of counting a bar up — a spinner can't say what is taking the time.",
      "Résumé preview now renders the actual paper, at the actual page size.",
    ],
  },
  {
    version: "2.2",
    date: "30 July 2026",
    kind: "Fix",
    items: [
      "The exported PDF now matches the preview it promises — the two used to disagree about spacing near a page break.",
      "Long requirement tags wrap inside their card instead of pushing out of it.",
      "Résumés that overflowed are fitted to one page rather than silently spilling onto a second.",
    ],
  },
  {
    version: "2.1",
    date: "30 July 2026",
    kind: "Improvement",
    items: [
      "Prep tab rebuilt around question families, with worked answers drawn only from bullets you wrote.",
      "Empty question families say why they are empty instead of padding themselves.",
    ],
  },
  {
    version: "2.0",
    date: "29 July 2026",
    kind: "Release",
    items: [
      "The four-stage pipeline, six templates with computed ATS ratings, question families and the vetted course catalog.",
      "Accounts are provisioned on first use rather than trusting the sign-up webhook to arrive — a signed-in person with no row could previously do nothing at all.",
      "Row-level security on every table carrying your data, keyed to your account and applied from a file in the repo.",
    ],
  },
];

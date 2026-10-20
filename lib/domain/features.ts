/**
 * The switchable surfaces (F31). PURE — the list the admin panel renders and
 * `lib/features.ts` reads against. Mirrors the `feature_key` enum; adding a
 * surface is a migration, a row here, and a `requireFeature` at its seams.
 */
export type FeatureKey = "jobs" | "portfolio" | "rapid" | "roadmap" | "study" | "rounds" | "ai_checkers";

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  /** What switching it off does, in the admin's words. */
  description: string;
}

export const FEATURES: FeatureDef[] = [
  {
    key: "ai_checkers",
    label: "AI fact-checkers",
    description:
      "Jev checks every tailored bullet, summary and full answer for claims the member's profile can't back. Off leaves the built-in rules on their own.",
  },
  {
    key: "jobs",
    label: "Job search",
    description: "The Jobs page and every listing search. Saved jobs stay in the database.",
  },
  {
    key: "roadmap",
    label: "Roadmap",
    description: "The Roadmap tab on an analysis. Built roadmaps are kept, just not shown.",
  },
  {
    key: "study",
    label: "Study plan",
    description: "The study plan fitted into a member's week before an interview.",
  },
  {
    key: "rapid",
    label: "Rapid prep",
    description: "The quiz and coding drills under an analysis.",
  },
  {
    key: "portfolio",
    label: "Portfolio site",
    description: "Building and publishing a portfolio page from a profile.",
  },
  {
    key: "rounds",
    label: "Interview rounds",
    description: "Logging rounds and their reminders. Already-queued reminders still send.",
  },
];
